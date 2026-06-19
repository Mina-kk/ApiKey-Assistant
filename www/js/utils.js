// new-api 工具函数层
// Channel 标准化、Key 解析、模型映射、分组、存储、剪贴板等

function $(id) { return document.getElementById(id); }

function createId() {
  return "id_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function uniqueArray(arr) {
  var list = arr || [];
  var map = {};
  var result = [];
  list.forEach(function (item) {
    var value = String(item || "").trim();
    if (!value) return;
    if (!map[value]) {
      map[value] = true;
      result.push(value);
    }
  });
  result.sort(function (a, b) { return a.localeCompare(b); });
  return result;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) { return escapeHtml(value); }

function maskKey(key) {
  key = String(key || "");
  if (!key) return "";
  if (key.length <= 12) return "*".repeat(key.length);
  return key.slice(0, 6) + "********" + key.slice(-6);
}

function formatTime(ts) {
  if (!ts) return "-";
  var d = new Date(ts);
  var pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return "-";
  if (ms < 1000) return ms + " ms";
  return (ms / 1000).toFixed(2) + " s";
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

function safeJsonStringify(obj) {
  try { return JSON.stringify(obj, null, 2); } catch (e) { return ""; }
}

function isValidJson(str) {
  try { JSON.parse(str); return true; } catch (e) { return false; }
}

// Channel Key 解析
function parseChannelKeys(keyValue) {
  var trimmed = String(keyValue || "").trim();
  if (!trimmed) return [];
  if (trimmed.indexOf("[") === 0) {
    var arr = safeJsonParse(trimmed, null);
    if (Array.isArray(arr)) {
      return arr.map(function (v) { return String(v || "").trim(); }).filter(Boolean);
    }
  }
  return trimmed.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
}

// 模型映射
function parseModelMapping(mappingValue) {
  if (!mappingValue) return {};
  if (typeof mappingValue === "object" && !Array.isArray(mappingValue)) return mappingValue;
  return safeJsonParse(mappingValue, {});
}

function applyModelMapping(modelName, mapping) {
  if (!modelName) return modelName;
  var mapObj = parseModelMapping(mapping);
  if (mapObj[modelName]) return String(mapObj[modelName]);
  return modelName;
}

// Channel 标准化
function normalizeChannel(item) {
  item = item || {};
  var channelType = ChannelType.Custom;
  if (typeof item.type === "number") channelType = item.type;
  else if (item.provider === "openai") channelType = ChannelType.OpenAI;
  else if (item.provider === "google") channelType = ChannelType.Gemini;
  else if (item.provider === "claude") channelType = ChannelType.Anthropic;
  else if (item.provider === "custom") channelType = ChannelType.Custom;

  var rawKeys = [];
  if (Array.isArray(item.keys) && item.keys.length) {
    item.keys.forEach(function (k) {
      if (typeof k === "string") rawKeys.push(k);
      else if (k && k.value) rawKeys.push(k.value);
    });
  } else if (item.key) {
    rawKeys = parseChannelKeys(item.key);
  } else if (item.apiKey) {
    rawKeys = [item.apiKey];
  }

  var labeledKeys = [];
  if (Array.isArray(item.keys)) {
    item.keys.forEach(function (k, idx) {
      if (k && (k.value || k.apiKey)) {
        labeledKeys.push({
          id: k.id || createId(),
          label: k.label || ("Key " + (idx + 1)),
          value: k.value || k.apiKey
        });
      }
    });
  }
  if (!labeledKeys.length && rawKeys.length) {
    labeledKeys = rawKeys.map(function (v, idx) {
      return { id: createId(), label: "Key " + (idx + 1), value: v };
    });
  }

  var models = [];
  if (typeof item.models === "string" && item.models.trim()) {
    models = item.models.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  } else if (Array.isArray(item.models)) {
    models = item.models;
  }

  var baseUrl = normalizeBaseUrl(item.base_url || item.baseUrl || "");
  if (!baseUrl && channelType !== ChannelType.Custom) {
    baseUrl = ChannelBaseURLs[channelType] || "";
  }

  var channelInfo = item.channel_info || {};
  var multiKeyMode = channelInfo.multi_key_mode != null ? channelInfo.multi_key_mode : MultiKeyMode.Single;

  var now = Date.now();
  return {
    id: item.id || createId(),
    type: channelType,
    name: item.name || "未命名渠道",
    key: rawKeys.join("\n"),
    keys: labeledKeys,
    base_url: baseUrl,
    models: uniqueArray(models),
    model_mapping: item.model_mapping || item.modelMapping || null,
    group: item.group || "default",
    status: typeof item.status === "number" ? item.status : 1,
    weight: item.weight != null ? Number(item.weight) : 0,
    priority: item.priority != null ? Number(item.priority) : 0,
    auto_ban: item.auto_ban != null ? Number(item.auto_ban) : 1,
    response_time: item.response_time != null ? Number(item.response_time) : 0,
    test_time: item.test_time || 0,
    test_model: item.test_model || null,
    balance: item.balance != null ? Number(item.balance) : 0,
    balance_updated_time: item.balance_updated_time || 0,
    used_quota: item.used_quota || 0,
    tag: item.tag || null,
    remark: item.remark || null,
    other_settings: item.other_settings || item.settings || "",
    param_override: item.param_override || null,
    header_override: item.header_override || null,
    openai_organization: item.openai_organization || null,
    channel_info: {
      is_multi_key: rawKeys.length > 1,
      multi_key_mode: multiKeyMode,
      multi_key_polling_index: channelInfo.multi_key_polling_index || 0
    },
    created_time: item.created_time || item.createdAt || now,
    updated_time: item.updated_time || item.updatedAt || now
  };
}

function getChannelFirstKey(channel) {
  if (channel.keys && channel.keys.length) return channel.keys[0].value;
  var keys = parseChannelKeys(channel.key);
  return keys[0] || "";
}

function getChannelKeyByIndex(channel, index) {
  var keys = channel.keys && channel.keys.length ? channel.keys : parseChannelKeys(channel.key).map(function (v, i) {
    return { id: createId(), label: "Key " + (i + 1), value: v };
  });
  return keys[index % keys.length];
}

function getChannelNextKey(channel) {
  var info = channel.channel_info || {};
  var mode = info.multi_key_mode || MultiKeyMode.Single;
  var keys = channel.keys || [];
  if (!keys.length) return null;
  if (mode === MultiKeyMode.Random) {
    return keys[Math.floor(Math.random() * keys.length)];
  }
  if (mode === MultiKeyMode.Polling) {
    var idx = info.multi_key_polling_index || 0;
    info.multi_key_polling_index = (idx + 1) % keys.length;
    return keys[idx];
  }
  return keys[0];
}

// 分组管理
function loadGroups() {
  var groups = new Set(["default"]);
  AppState.channels.forEach(function (ch) {
    if (ch.group) groups.add(ch.group);
  });
  var saved = [];
  try {
    var raw = localStorage.getItem("new_api_groups_v3");
    if (raw) saved = JSON.parse(raw);
  } catch (e) {}
  saved.forEach(function (g) { groups.add(g); });
  return Array.from(groups).sort();
}

function saveGroups() {
  localStorage.setItem("new_api_groups_v3", JSON.stringify(AppState.groups));
}

function ensureGroupExists(group) {
  if (!group || AppState.groups.indexOf(group) !== -1) return;
  AppState.groups.push(group);
  AppState.groups.sort();
  saveGroups();
}

function renameGroup(oldName, newName) {
  if (!newName || oldName === newName || newName === "default") return false;
  AppState.channels.forEach(function (ch) {
    if (ch.group === oldName) ch.group = newName;
  });
  var idx = AppState.groups.indexOf(oldName);
  if (idx !== -1) AppState.groups[idx] = newName;
  AppState.groups.sort();
  saveGroups();
  saveChannels();
  return true;
}

function deleteGroup(name) {
  if (name === "default") return false;
  AppState.channels.forEach(function (ch) {
    if (ch.group === name) ch.group = "default";
  });
  AppState.groups = AppState.groups.filter(function (g) { return g !== name; });
  saveGroups();
  saveChannels();
  return true;
}

// 存储
function loadChannels() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) return arr.map(function (item) { return normalizeChannel(item); });
  } catch (e) {}
  return [];
}

function saveChannels() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.channels));
}

function loadSettings() {
  try {
    var raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      var s = JSON.parse(raw);
      Object.assign(AppState.settings, s);
    }
  } catch (e) {}
  try {
    var theme = localStorage.getItem(THEME_KEY);
    if (theme) AppState.settings.theme = theme;
  } catch (e) {}
  ensureRuntimeState();
}

function ensureRuntimeState() {
  if (!AppState.settings) AppState.settings = {};
  if (!AppState.settings.timeout) AppState.settings.timeout = 60;
  if (!AppState.settings.concurrency) AppState.settings.concurrency = 4;
  if (!AppState.settings.defaultPrompt) AppState.settings.defaultPrompt = "用中文简单回复：Hello, who are you?";
  if (!AppState.settings.localProxyUrl) AppState.settings.localProxyUrl = "http://127.0.0.1:9527";
  if (typeof AppState.settings.newApiEnabled !== "boolean") AppState.settings.newApiEnabled = false;
  if (!AppState.proxy) AppState.proxy = {};
  if (typeof AppState.proxy.enabled !== "boolean") AppState.proxy.enabled = false;
  if (AppState.proxy.latency === undefined) AppState.proxy.latency = null;
  if (!AppState.proxy.lastChecked) AppState.proxy.lastChecked = 0;
  if (AppState.proxy.error === undefined) AppState.proxy.error = "未检测";
  if (AppState.proxy.timer === undefined) AppState.proxy.timer = null;
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(AppState.settings));
  localStorage.setItem(THEME_KEY, AppState.settings.theme);
}

// UI 辅助
function getProviderLabel(channelType) {
  return GetChannelTypeName(channelType);
}

function showToast(message, type) {
  clearTimeout(AppState.toastTimer);
  var prefixMap = { success: "✓ ", error: "✕ ", warning: "⚠ ", info: "" };
  var prefix = prefixMap[type || "info"] || "";
  var toast = AppState.els.toast;
  if (!toast) return;
  toast.textContent = prefix + message;
  toast.classList.add("show");
  AppState.toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2400);
}

function copyText(text, message) {
  var value = String(text || "");

  // Cordova clipboard plugin
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.clipboard) {
    window.cordova.plugins.clipboard.copy(value, function () {
      showToast(message || "已复制", "success");
    }, function () {
      fallbackCopy(value, message);
    });
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(function () {
      showToast(message || "已复制", "success");
    }).catch(function () { fallbackCopy(value, message); });
  } else {
    fallbackCopy(value, message);
  }
}

function fallbackCopy(value, message) {
  var textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
    showToast(message || "已复制", "success");
  } catch (e) { showToast("复制失败", "error"); }
  textarea.remove();
}

function readClipboardText(callback) {
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.clipboard) {
    window.cordova.plugins.clipboard.paste(function (text) { callback(text); }, function () { callback(""); });
    return;
  }
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function (text) { callback(text); }).catch(function () { callback(""); });
  } else {
    callback("");
  }
}

function setStatus(el, text, type) {
  if (!el) return;
  el.textContent = text || "";
  el.className = "status-text" + (type ? " " + type : "");
}

function openModal(el) { if (el) el.classList.add("active"); }
function closeModal(el) { if (el) el.classList.remove("active"); }

function closeAllModals() {
  ["editorModal", "modelMappingModal", "testModal", "importModal", "exportModal", "settingsModal", "groupModal", "sortModal", "newApiModal"].forEach(function (id) {
    closeModal(AppState.els[id]);
  });
}

// 运行日志：记录网络请求、代理状态与应用错误
var LOG_STORAGE_KEY = "new_api_runtime_logs_v1";
var MAX_LOG_LINES = 500;

function getLogs() {
  try {
    var arr = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveLogs(arr) {
  try { localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(arr.slice(-MAX_LOG_LINES))); } catch (e) {}
}

function addLog(level, message, data) {
  var line = {
    time: new Date().toISOString(),
    level: level || "info",
    message: String(message || ""),
    data: data === undefined ? null : data
  };
  var arr = getLogs();
  arr.push(line);
  saveLogs(arr);
  try {
    var out = AppState && AppState.els && AppState.els.logOutput;
    if (out && AppState.els.logModal && AppState.els.logModal.classList.contains("active")) renderLogs();
  } catch (e) {}
}

function formatLogLine(x) {
  var data = x.data == null ? "" : " " + (typeof x.data === "string" ? x.data : safeJsonStringify(x.data));
  return "[" + x.time + "] [" + String(x.level || "info").toUpperCase() + "] " + x.message + data;
}

function renderLogs() {
  if (!AppState.els.logOutput) return;
  AppState.els.logOutput.textContent = getLogs().map(formatLogLine).join("\n");
  AppState.els.logOutput.scrollTop = AppState.els.logOutput.scrollHeight;
}

function openLogModal() { renderLogs(); openModal(AppState.els.logModal); }
function copyLogs() { copyText(getLogs().map(formatLogLine).join("\n"), "日志已复制"); }
function clearLogs() { saveLogs([]); renderLogs(); showToast("日志已清空", "success"); }

(function installLogHooks(){
  try {
    window.addEventListener("error", function (e) { addLog("error", "window.error", { message: e.message, source: e.filename, line: e.lineno, col: e.colno }); });
    window.addEventListener("unhandledrejection", function (e) { addLog("error", "unhandledrejection", String(e.reason && (e.reason.stack || e.reason.message) || e.reason)); });
  } catch (e) {}
})();
