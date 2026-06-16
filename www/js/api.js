// ============================================================
// new-api 中继/适配器层（对应后端 relay/relay_adaptor.go）
// ============================================================

function doHttpRequest(method, url, headers, body, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var timer = null;
    var finished = false;
    var startedAt = Date.now();
    var safeUrl = String(url || "").replace(/(key=)[^&]+/ig, "$1***");
    if (typeof addLog === "function") addLog("debug", "HTTP request start", { method: method, url: safeUrl });

    function done(ok, value) {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (typeof addLog === "function") addLog(ok ? "debug" : "error", "HTTP request " + (ok ? "success" : "failed"), {
        method: method,
        url: safeUrl,
        cost: Date.now() - startedAt,
        error: ok ? "" : String(value && (value.message || value) || "")
      });
      ok ? resolve(value) : reject(value);
    }

    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(function () { done(false, new Error("请求超时")); }, timeoutMs);
    }

    // 优先使用 Cordova 原生请求通道，避免 WebView 跨域与本地网络限制。
    if (window.cordova && typeof cordova.exec === "function") {
      try {
        cordova.exec(function (nativeResp) {
          try {
            if (typeof nativeResp === "string") nativeResp = JSON.parse(nativeResp || "{}");
            if (nativeResp.ok) done(true, nativeResp.body || "");
            else done(false, new Error("NativeHttp " + (nativeResp.status || 0) + " " + (nativeResp.error || nativeResp.body || "")));
          } catch (e) { done(false, e); }
        }, function (err) {
          var msg = typeof err === "string" ? err : JSON.stringify(err || {});
          done(false, new Error("NativeHttp plugin failed: " + msg));
        }, "NativeHttp", "request", [method, url, JSON.stringify(headers || {}), body || "", timeoutMs || 60000]);
      } catch (e) {
        if (typeof addLog === "function") addLog("error", "NativeHttp invoke failed", e.message || String(e));
      }
      return;
    }

    // 备用原生桥请求通道。
    if (window.AndroidBridge && typeof window.AndroidBridge.httpRequest === "function") {
      try {
        var nativeRaw = window.AndroidBridge.httpRequest(method, url, JSON.stringify(headers || {}), body || "");
        var nativeResp = JSON.parse(nativeRaw || "{}");
        if (nativeResp.ok) done(true, nativeResp.body || "");
        else done(false, new Error("Native HTTP " + (nativeResp.status || 0) + " " + (nativeResp.error || nativeResp.body || "")));
      } catch (e) { done(false, e); }
      return;
    }

    // Cordova 原生 HTTP 插件（绕过 CORS）
    if (window.cordova && cordova.plugin && cordova.plugin.http) {
      var options = {
        method: method,
        headers: headers || {},
        data: body || "",
        responseType: "text",
        timeout: timeoutMs || AppState.settings.timeout * 1000
      };
      cordova.plugin.http.sendRequest(url, options,
        function (resp) { done(true, resp.data); },
        function (resp) { done(false, new Error(resp.error || ("HTTP " + resp.status) || "HTTP failed")); }
      );
      return;
    }

    // 浏览器 fetch 降级
    var controller = new AbortController();
    var opts = { method: method, headers: headers || {}, signal: controller.signal };
    if (body) opts.body = body;
    if (timeoutMs && timeoutMs > 0) setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs);

    fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (text) { done(true, text); }).catch(function (e) { done(false, e); });
  });
}

function joinApiPath(baseUrl, path) {
  var clean = normalizeBaseUrl(baseUrl);
  var p = String(path || "");
  if (p.indexOf("/") !== 0) p = "/" + p;

  // 兼容上游 Base URL 已经带版本号的情况：
  // - OpenAI 类通常是 /v1 + /v1/xxx，需要去重
  // - 智谱官方常填写 https://open.bigmodel.cn/api/paas/v4，
  //   如果再拼 /v1/chat/completions 会变成 /v4/v1/... 导致测试失败。
  if (/\/(v1|v2|v3|v4)$/i.test(clean) && /^\/v[1-4]\//i.test(p)) {
    p = p.replace(/^\/v[1-4]/i, "");
  }
  return clean + p;
}

function isOpenCodeZenBase(baseUrl) {
  try {
    var u = new URL(String(baseUrl || ""));
    return /(^|\.)opencode\.ai$/i.test(u.hostname) && /\/zen\/go\/v1\/?$/i.test(u.pathname);
  } catch (e) {
    return /https?:\/\/([^/]+\.)?opencode\.ai\/zen\/go\/v1\/?$/i.test(String(baseUrl || ""));
  }
}

function buildLocalProxyCandidates(targetUrl) {
  var proxy = normalizeBaseUrl(AppState.settings.localProxyUrl || "http://127.0.0.1:9527");
  var u;
  try { u = new URL(targetUrl); } catch (e) { u = null; }
  var pathAndQuery = u ? (u.pathname + u.search) : "";
  return uniqueArray([
    proxy + pathAndQuery,
    proxy + "/proxy?url=" + encodeURIComponent(targetUrl),
    proxy + "/request?url=" + encodeURIComponent(targetUrl),
    proxy + "/fetch?url=" + encodeURIComponent(targetUrl),
    proxy + "/?url=" + encodeURIComponent(targetUrl)
  ]);
}

function requestViaLocalProxyOrDirect(method, url, headers, body, timeoutMs, preferProxy) {
  if (!preferProxy) return doHttpRequest(method, url, headers, body, timeoutMs);
  var candidates = buildLocalProxyCandidates(url);
  var index = 0;
  function tryNext(lastErr) {
    if (index >= candidates.length) {
      return Promise.reject(lastErr || new Error("本地代理请求失败"));
    }
    var proxyUrl = candidates[index++];
    var h = Object.assign({}, headers || {}, {
      "X-Target-URL": url,
      "X-Proxy-Target": url
    });
    return doHttpRequest(method, proxyUrl, h, body, timeoutMs).catch(tryNext);
  }
  return tryNext();
}

// 模型列表解析
function parseOpenAILikeModelList(data) {
  var models = [];
  if (Array.isArray(data.data)) {
    data.data.forEach(function (x) {
      var v = typeof x === "string" ? x : x.id || x.name;
      if (v) models.push(String(v).trim());
    });
  }
  if (Array.isArray(data.models)) {
    data.models.forEach(function (x) {
      var v = typeof x === "string" ? x : x.id || x.name;
      if (v) models.push(String(v).trim());
    });
  }
  return uniqueArray(models);
}

function parseGeminiModelList(data) {
  var models = [];
  (data.models || []).forEach(function (x) {
    var name = typeof x === "string" ? x : x.name || x.id;
    if (!name) return;
    name = String(name).trim();
    if (name.indexOf("models/") === 0) name = name.slice(7);
    models.push(name);
  });
  return uniqueArray(models);
}

// Adaptor 定义
var OpenAIAdaptor = {
  apiType: APIType.OpenAI,
  name: "OpenAI",
  getModelListUrl: function (baseUrl) { return joinApiPath(baseUrl, "/v1/models"); },
  getModelListHeaders: function (key) { return { "Authorization": "Bearer " + key }; },
  parseModelList: parseOpenAILikeModelList,
  getChatUrl: function (baseUrl) { return joinApiPath(baseUrl, "/v1/chat/completions"); },
  getChatHeaders: function (key) {
    return { "Authorization": "Bearer " + key, "Content-Type": "application/json" };
  },
  buildChatRequest: function (model, prompt) {
    return { model: model, messages: [{ role: "user", content: prompt }], max_tokens: 512 };
  },
  parseChatResponse: function (data) {
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data.choices?.[0]?.message?.content || JSON.stringify(data);
  }
};

var AnthropicAdaptor = {
  apiType: APIType.Anthropic,
  name: "Anthropic",
  getModelListUrl: function (baseUrl) { return joinApiPath(baseUrl, "/v1/models"); },
  getModelListHeaders: function (key) {
    return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  },
  parseModelList: parseOpenAILikeModelList,
  getChatUrl: function (baseUrl) { return normalizeBaseUrl(baseUrl) + "/v1/messages"; },
  getChatHeaders: function (key) {
    return { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" };
  },
  buildChatRequest: function (model, prompt) {
    return { model: model, max_tokens: 512, messages: [{ role: "user", content: prompt }] };
  },
  parseChatResponse: function (data) {
    if (data.error) throw new Error(JSON.stringify(data.error));
    if (Array.isArray(data.content)) {
      return data.content.map(function (x) { return x.text || ""; }).join("\n");
    }
    return JSON.stringify(data);
  }
};

var GeminiAdaptor = {
  apiType: APIType.Gemini,
  name: "Gemini",
  getModelListUrl: function (baseUrl, key) {
    return normalizeBaseUrl(baseUrl) + "/v1/models?key=" + encodeURIComponent(key);
  },
  getModelListHeaders: function () { return {}; },
  parseModelList: parseGeminiModelList,
  getChatUrl: function (baseUrl, model, key) {
    return normalizeBaseUrl(baseUrl) + "/v1/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);
  },
  getChatHeaders: function () { return { "Content-Type": "application/json" }; },
  buildChatRequest: function (model, prompt) {
    return { contents: [{ parts: [{ text: prompt }] }] };
  },
  parseChatResponse: function (data) {
    if (data.error) throw new Error(JSON.stringify(data.error));
    var parts = data.candidates?.[0]?.content?.parts || [];
    var text = parts.map(function (x) { return x.text || ""; }).join("\n");
    return text || JSON.stringify(data);
  }
};

var GenericOpenAICompatibleAdaptor = {
  apiType: APIType.OpenAI,
  name: "OpenAI Compatible",
  getModelListUrl: OpenAIAdaptor.getModelListUrl,
  getModelListHeaders: OpenAIAdaptor.getModelListHeaders,
  parseModelList: OpenAIAdaptor.parseModelList,
  getChatUrl: OpenAIAdaptor.getChatUrl,
  getChatHeaders: OpenAIAdaptor.getChatHeaders,
  buildChatRequest: OpenAIAdaptor.buildChatRequest,
  parseChatResponse: OpenAIAdaptor.parseChatResponse
};

var AdaptorRegistry = {};

function RegisterAdaptor(apiType, adaptor) { AdaptorRegistry[apiType] = adaptor; }
function GetAdaptor(apiType) { return AdaptorRegistry[apiType] || GenericOpenAICompatibleAdaptor; }

RegisterAdaptor(APIType.OpenAI, OpenAIAdaptor);
RegisterAdaptor(APIType.Anthropic, AnthropicAdaptor);
RegisterAdaptor(APIType.Gemini, GeminiAdaptor);
[
  APIType.PaLM, APIType.Baidu, APIType.Zhipu, APIType.Ali, APIType.Xunfei,
  APIType.AIProxyLibrary, APIType.Tencent, APIType.ZhipuV4, APIType.Ollama,
  APIType.Perplexity, APIType.Aws, APIType.Cohere, APIType.Dify, APIType.Jina,
  APIType.Cloudflare, APIType.SiliconFlow, APIType.VertexAi, APIType.Mistral,
  APIType.DeepSeek, APIType.MokaAI, APIType.VolcEngine, APIType.BaiduV2,
  APIType.OpenRouter, APIType.Xinference, APIType.Xai, APIType.Coze,
  APIType.Jimeng, APIType.Moonshot, APIType.Submodel, APIType.MiniMax,
  APIType.Replicate, APIType.Codex
].forEach(function (apiType) { RegisterAdaptor(apiType, GenericOpenAICompatibleAdaptor); });

function GenRelayInfo(channel, requestModel) {
  var apiType = ChannelTypeToAPIType(channel.type);
  var adaptor = GetAdaptor(apiType);
  var upstreamModel = applyModelMapping(requestModel, channel.model_mapping);
  return {
    channelId: channel.id,
    channelType: channel.type,
    apiType: apiType,
    channelBaseUrl: channel.base_url,
    originModelName: requestModel,
    upstreamModelName: upstreamModel,
    relayFormat: "openai",
    adaptor: adaptor
  };
}

// 获取上游模型列表
function fetchUpstreamModels(channel) {
  return new Promise(function (resolve, reject) {
    var apiType = ChannelTypeToAPIType(channel.type);
    var adaptor = GetAdaptor(apiType);
    var key = getChannelFirstKey(channel);
    if (!channel.base_url) return reject(new Error("缺少 Base URL"));
    if (!key) return reject(new Error("缺少 API Key"));

    var url = adaptor.getModelListUrl(channel.base_url, key);
    var headers = adaptor.getModelListHeaders(key);
    var preferProxy = isOpenCodeZenBase(channel.base_url);
    if (typeof addLog === "function") addLog("info", "fetchUpstreamModels", {
      channel: channel.name,
      base_url: channel.base_url,
      request_url: String(url).replace(/(key=)[^&]+/ig, "$1***"),
      apiType: apiType,
      preferProxy: preferProxy,
      hasAndroidBridge: !!(window.AndroidBridge && window.AndroidBridge.httpRequest),
      hasNativeHttp: !!(window.cordova && typeof cordova.exec === "function")
    });

    // 特定接口优先使用原生网络通道；普通渠道按默认通道请求。
    var requestPromise;
    if (preferProxy && window.AndroidBridge && typeof window.AndroidBridge.httpRequest === "function") {
      requestPromise = doHttpRequest("GET", url, headers, null, AppState.settings.timeout * 1000);
    } else {
      requestPromise = requestViaLocalProxyOrDirect("GET", url, headers, null, AppState.settings.timeout * 1000, preferProxy);
    }

    requestPromise.then(function (raw) {
      try {
        if (typeof addLog === "function") addLog("debug", "model raw response", { channel: channel.name, length: String(raw || "").length, sample: String(raw || "").slice(0, 300) });
        var data = JSON.parse(raw);
        var models = adaptor.parseModelList(data);
        if (!models.length) {
          reject(new Error(data.error ? JSON.stringify(data.error) : "未解析到模型列表"));
          return;
        }
        if (typeof addLog === "function") addLog("info", "models fetched", { channel: channel.name, count: models.length });
        resolve(models);
      } catch (e) { if (typeof addLog === "function") addLog("error", "parse model list failed", { channel: channel.name, error: e.message }); reject(e); }
    }).catch(function (e) {
      if (typeof addLog === "function") addLog("error", "fetchUpstreamModels failed", { channel: channel.name, error: e.message || String(e) });
      reject(e);
    });
  });
}

// 渠道测试
function testChannel(channel, modelName, prompt) {
  return new Promise(function (resolve, reject) {
    var startTime = Date.now();
    var apiType = ChannelTypeToAPIType(channel.type);
    var adaptor = GetAdaptor(apiType);
    var keyObj = getChannelNextKey(channel);
    var key = keyObj ? keyObj.value : "";

    if (!key) return reject(new Error("此渠道没有可用的 API Key"));

    var testModel = String(modelName || "").trim();
    if (!testModel) {
      if (channel.test_model) testModel = channel.test_model;
      else if (channel.models && channel.models.length) testModel = channel.models[0];
      else testModel = "gpt-4o-mini";
    }

    var info = GenRelayInfo(channel, testModel);
    var upstreamModel = info.upstreamModelName;

    var url = adaptor.getChatUrl(channel.base_url, upstreamModel, key);
    var headers = adaptor.getChatHeaders(key);
    var body = adaptor.buildChatRequest(upstreamModel, prompt || AppState.settings.defaultPrompt);

    doHttpRequest("POST", url, headers, JSON.stringify(body), AppState.settings.timeout * 1000).then(function (raw) {
      try {
        var data = JSON.parse(raw);
        var reply = adaptor.parseChatResponse(data);
        channel.response_time = Date.now() - startTime;
        channel.test_time = Date.now();
        resolve(reply);
      } catch (e) { reject(e); }
    }).catch(reject);
  });
}

// 批量并发
function runWithConcurrency(tasks, concurrency) {
  return new Promise(function (resolve) {
    var results = [];
    var index = 0;
    var running = 0;
    var done = false;

    function next() {
      if (done) return;
      if (index >= tasks.length && running === 0) {
        done = true;
        resolve(results);
        return;
      }
      while (running < concurrency && index < tasks.length) {
        let i = index++;
        running++;
        tasks[i]().then(function (res) {
          results[i] = { status: "fulfilled", value: res };
        }).catch(function (err) {
          results[i] = { status: "rejected", reason: err };
        }).finally(function () {
          running--;
          next();
        });
      }
    }
    next();
  });
}
