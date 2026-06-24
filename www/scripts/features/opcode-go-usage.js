/**
 * OpCode Go 套餐额度看板
 * 针对 https://opencode.ai/zen/go/v1 订阅，展示 Rolling/Weekly/Monthly 三级额度。
 * 主路径：直连 opencode 内部 RPC（/_server + Seroval + auth cookie），自动发现 workspace。
 * 回退：HTML dashboard 抓取。
 */
(function () {
  'use strict';

  var CREDS_KEY = 'ocg_saved_creds_v1';
  var CACHE_KEY = 'ocg_usage_cache_v2';
  var CACHE_TTL = 30 * 1000;
  var POLL_INTERVAL = 5000;
  var SERVER_BASE = 'https://opencode.ai/_server';
  var DASHBOARD_PREFIX = 'https://opencode.ai/workspace/';
  var DASHBOARD_SUFFIX = '/go';
  var OC_USAGE_API = 'https://opencode.ai/zen/go/v1/usage';

  // 内部 RPC server-function id（对应 opencode_go_check.py 的 SERVID）
  var SERVID = {
    workspaces: 'def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f',
    lite_subscription: 'c7389bd0e731f80f49593e5ee53835475f4e28594dd6bd83eb229bab753498cd',
    email: '44e81edfbd76665bfe0657aa7f751d7e73ab8d4a1b00f5b9909ba57ece0cf874'
  };

  var PARSE_KEYS = ['rolling', 'weekly', 'monthly'];
  var SUB_KEY_MAP = { rolling: 'rollingUsage', weekly: 'weeklyUsage', monthly: 'monthlyUsage' };

  var state = {
    loading: false,
    result: null,
    error: null,
    pollTimer: null,
    polling: false,
    instanceCounter: 0,
    currentPage: 1
  };

  var escapeHtml = window.escapeHtml || function (s) { return String(s == null ? '' : s); };
  var escapeAttr = escapeHtml;

  function isAuthCookieLooksLikeApiKey(v) {
    return /^sk-/i.test(String(v || '').trim());
  }

  // Seroval 编码（移植自 opencode_go_check.py seroval_args）
  function serovalArgs(args) {
    args = args || [];
    return {
      t: { t: 9, i: 0, l: args.length, a: args.map(function (s) { return { t: 1, s: String(s) }; }), o: 0 },
      f: 31,
      m: []
    };
  }

  // RPC 调用（移植自 OpenCodeClient._call）
  function callServer(cookie, serverId, args) {
    state.instanceCounter += 1;
    var headers = {
      'Cookie': 'auth=' + cookie,
      'Content-Type': 'application/json',
      'X-Server-Id': serverId,
      'X-Server-Instance': 'server-fn:js' + state.instanceCounter
    };
    var body = JSON.stringify(serovalArgs(args || []));
    var fn = (typeof requestViaLocalProxyOrDirect === 'function')
      ? requestViaLocalProxyOrDirect('POST', SERVER_BASE, headers, body, 20000, false, false, { disableProxy: true })
      : doHttpRequest('POST', SERVER_BASE, headers, body, 20000, false);
    return fn.then(function (raw) {
      return parseServerResponse(String(raw || ''));
    });
  }

  // Seroval 响应解析（移植自 _parse_js_response）
  function parseServerResponse(text) {
    text = String(text || '');

    // 302 重定向到 /auth/authorize（认证失败）
    if (/location["']\s*[:,]\s*["']\/auth\/authorize/.test(text)) {
      throw new Error('auth cookie 无效或已过期，请重新登录 opencode.ai 复制');
    }

    // 检测 Error
    var mErr = text.match(/\$R\[0\]=Object\.assign\(new Error\("((?:[^"\\]|\\.)*)"/) ||
                text.match(/\$R\[0\]=new Error\("((?:[^"\\]|\\.)*)"/);
    if (mErr) {
      var errMsg = mErr[1].replace(/\\(.)/g, '$1');
      if (/actor.*not associated.*account|account/i.test(errMsg)) {
        throw new Error('auth cookie 无效或已过期，请重新获取');
      }
      throw new Error('API 返回错误：' + errMsg);
    }

    // 匹配 $R[0]=<scalar|object|array>
    var m = text.match(/\$R\[0\]=(null|false|true|-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|[{\[])/);
    if (!m) {
      // 试 => <scalar>) 格式
      var mArrow = text.match(/=>\s*(null|false|true|-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*")\s*\)/);
      if (mArrow) return scalarFromStr(mArrow[1]);
      // 试 [],<scalar>) 格式
      var mNull = text.match(/\[\],\s*(null|false|true|-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*)\s*\)/);
      if (mNull) return scalarFromStr(mNull[1]);
      throw new Error('无法解析 RPC 响应：' + text.slice(0, 160));
    }

    var valueStr = m[1];
    // 标量
    if (valueStr === 'null') return null;
    if (valueStr === 'false') return false;
    if (valueStr === 'true') return true;
    if (valueStr[0] === '"') { try { return JSON.parse(valueStr); } catch (e) { return valueStr; } }
    if (valueStr[0] === '-' || /^\d/.test(valueStr)) {
      return valueStr.indexOf('.') !== -1 ? parseFloat(valueStr) : parseInt(valueStr, 10);
    }

    // 对象/数组：括号匹配提取（清理其他 $R refs）
    var clean = text.replace(/\$R\[\d+\]=/g, '');
    var mObj = clean.match(/=>\s*([{\[])/);
    var valStart, openC, closeC;
    if (mObj) {
      valStart = mObj.index + mObj[0].length - 1;
      openC = mObj[1];
    } else {
      throw new Error('清理后无法定位对象/数组：' + clean.slice(0, 160));
    }
    closeC = openC === '{' ? '}' : ']';

    var depth = 0, i = valStart, len = clean.length;
    while (i < len) {
      var c = clean[i];
      if (c === openC) depth++;
      else if (c === closeC) { depth--; if (depth === 0) break; }
      else if (c === '"') {
        i++;
        while (i < len && clean[i] !== '"') {
          if (clean[i] === '\\') i++;
          i++;
        }
      }
      i++;
    }
    var jsVal = clean.slice(valStart, i + 1);

    // JS 字面量 → JSON
    jsVal = jsVal.replace(/new Date\("((?:[^"\\]|\\.)*)"\)/g, '"$1"');
    jsVal = jsVal.replace(/!0/g, 'true').replace(/!1/g, 'false');
    jsVal = jsVal.replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":');
    jsVal = jsVal.replace(/'((?:[^'\\]|\\.)*)'/g, function (_, g1) { return '"' + g1.replace(/"/g, '\\"') + '"'; });

    try {
      return JSON.parse(jsVal);
    } catch (e) {
      throw new Error('JSON 解析失败：' + jsVal.slice(0, 160));
    }
  }

  function scalarFromStr(s) {
    if (s === 'null') return null;
    if (s === 'false') return false;
    if (s === 'true') return true;
    if (s[0] === '"') { try { return JSON.parse(s); } catch (e) { return s; } }
    if (s[0] === '-' || /^\d/.test(s)) return s.indexOf('.') !== -1 ? parseFloat(s) : parseInt(s, 10);
    return s;
  }

  // RPC 数据获取
  function fetchWorkspaces(cookie) {
    return callServer(cookie, SERVID.workspaces, []);
  }
  function fetchLiteSubscription(cookie, workspaceId) {
    return callServer(cookie, SERVID.lite_subscription, [workspaceId]);
  }
  function fetchEmail(cookie, workspaceId) {
    return callServer(cookie, SERVID.email, [workspaceId]).then(function (v) { return v || ''; }).catch(function () { return ''; });
  }

  // 回退：HTML 抓取
  function fetchHtmlWithCookie(url, cookie, timeoutMs) {
    var headers = { 'Accept': 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' };
    if (cookie) headers['Cookie'] = 'auth=' + cookie;
    if (typeof requestViaLocalProxyOrDirect === 'function') {
      return requestViaLocalProxyOrDirect('GET', url, headers, null, timeoutMs || 20000, false, false, { disableProxy: true });
    }
    return doHttpRequest('GET', url, headers, null, timeoutMs || 20000, false);
  }

  function parseUsageFromHtml(html) {
    var text = String(html || '');
    if (!text) return null;
    var result = {}, found = false;
    function extractWindow(key) {
      var re = new RegExp('"' + key + 'Usage"[\\s\\S]{0,200}?(?:usagePercent|percent)[\'"]?\\s*[:=]\\s*([0-9.]+)[\\s\\S]{0,200}?(?:resetInSec|reset_in_sec)[\'"]?\\s*[:=]\\s*([0-9]+)', 'i');
      var m = text.match(re);
      if (m) return { percent: Number(m[1]), resetInSec: Number(m[2]) };
      var re2 = new RegExp('"' + key + '"[\\s\\S]{0,400}?"usagePercent"\\s*:\\s*([0-9.]+)[\\s\\S]{0,200}?"resetInSec"\\s*:\\s*([0-9]+)', 'i');
      m = text.match(re2);
      if (m) return { percent: Number(m[1]), resetInSec: Number(m[2]) };
      return null;
    }
    PARSE_KEYS.forEach(function (k) {
      var v = extractWindow(k);
      if (v) { result[k] = v; found = true; }
    });
    return found ? result : null;
  }

  function fetchViaCookieFallback(workspaceId, cookie) {
    var url = DASHBOARD_PREFIX + window.encodeURIComponent(workspaceId) + DASHBOARD_SUFFIX;
    return fetchHtmlWithCookie(url, cookie, 20000).then(function (raw) {
      var text = String(raw || '');
      if (/\/auth\/authorize|window\.location\s*=\s*["']\/auth/i.test(text)) {
        throw new Error('auth cookie 无效或已过期，请重新获取');
      }
      var usage = parseUsageFromHtml(text);
      if (!usage) throw new Error('无法解析套餐额度（页面结构已变或 cookie 过期）');
      return usage;
    });
  }

  function normalizeSub(sub) {
    if (!sub) return null;
    var out = { mine: !!sub.mine, useBalance: !!sub.useBalance, windows: {} };
    PARSE_KEYS.forEach(function (k) {
      var u = sub[SUB_KEY_MAP[k]] || {};
      out.windows[k] = { percent: Number(u.usagePercent) || 0, resetInSec: Number(u.resetInSec) || 0, status: u.status || '' };
    });
    return out;
  }

  // 主查询：多 cookie 账号池，逐个账号 RPC 列 workspace → 查订阅（+邮箱）→ 失败回退 HTML
    function fetchUsage(cookies, onlyWorkspaceId) {
      cookies = cookies || [];
      if (!cookies.length) throw new Error('请填写 auth cookie');
      var allAccounts = [];
      return cookies.reduce(function (chain, cookie) {
        return chain.then(function () {
          return fetchSingleAccount(cookie, onlyWorkspaceId).then(function (acct) {
            allAccounts.push(acct);
          }).catch(function (err) {
            allAccounts.push({ cookie: cookie, email: '', items: [], error: err.message || String(err) });
          });
        });
      }, Promise.resolve()).then(function () {
        return { accounts: allAccounts };
      });
    }

    function fetchSingleAccount(cookie, onlyWorkspaceId) {
      var workspaces;
      var wsPromise = onlyWorkspaceId
        ? Promise.resolve([{ id: onlyWorkspaceId, name: onlyWorkspaceId }])
        : fetchWorkspaces(cookie).then(function (ws) {
            if (!ws) throw new Error('获取 workspace 列表失败');
            if (!Array.isArray(ws) || !ws.length) throw new Error('未找到任何 workspace');
            return ws;
          });

      return wsPromise.then(function (wsList) {
        workspaces = wsList;
        var tasks = wsList.map(function (ws) {
          return fetchLiteSubscription(cookie, ws.id).then(function (sub) {
            return { workspace: ws, sub: normalizeSub(sub), viaRpc: true };
          }).catch(function () {
            return fetchViaCookieFallback(ws.id, cookie).then(function (usage) {
              return { workspace: ws, sub: { windows: usage, mine: false, useBalance: false }, viaRpc: false };
            }).catch(function (e2) {
                        return { workspace: ws, sub: null, viaRpc: false, error: e2.message || String(e2) };
                      });
          });
        });
        return Promise.all(tasks);
      }).then(function (items) {
        return fetchEmail(cookie, workspaces[0].id).then(function (email) {
          return { cookie: cookie, email: email, items: items };
        }).catch(function () { return { cookie: cookie, email: '', items: items }; });
      });
    }

  // 凭据存储（仅本地存储，无列表渲染）
  function loadCreds() { try { return JSON.parse(localStorage.getItem(CREDS_KEY) || '[]'); } catch (e) { return []; } }
  function saveCreds(list) { try { localStorage.setItem(CREDS_KEY, JSON.stringify(list)); } catch (e) {} }
  function addCred(cookie, label) {
    var list = loadCreds();
    list.push({ cookie: cookie, label: label || ('账号 ' + (list.length + 1)), addedAt: Date.now() });
    saveCreds(list);
    return list;
  }
  function removeCred(label) {
    var list = loadCreds().filter(function (c) { return c.label !== label; });
    saveCreds(list);
    return list;
  }
  function populateCredSelect() {
    // 凭据仅本地存储，不渲染列表
  }

  function populateCredSelect() {
    var box = document.getElementById('ocgCredList');
    if (!box) return;
    var list = loadCreds();
    if (!list.length) { box.innerHTML = '<div class="ocg-cred-empty">暂无已保存凭据</div>'; return; }
    box.innerHTML = list.map(function (c, i) {
      return '<div class="ocg-cred-item"><label class="ocg-cred-check"><input type="checkbox" class="ocg-cred-checkbox" data-idx="' + i + '" /> <span class="ocg-cred-label">' + escapeHtml(c.label || ('账号 ' + (i + 1))) + '</span></label><button class="danger-btn small-btn ocg-cred-del-btn" type="button" data-idx="' + i + '">删除</button></div>';
    }).join('');
    box.querySelectorAll('.ocg-cred-del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-idx'));
        var list = loadCreds();
        if (list[idx]) { if (!confirm('确定删除？')) return; list.splice(idx, 1); saveCreds(list); populateCredSelect(); window.showToast('已删除', 'success'); }
      });
    });
    // 重命名：点击标签弹出修改
    box.querySelectorAll('.ocg-cred-label').forEach(function (el) {
      el.addEventListener('dblclick', function () {
        var idx = Number(el.parentElement.parentElement.querySelector('.ocg-cred-checkbox').getAttribute('data-idx'));
        var list = loadCreds();
        if (!list[idx]) return;
        var newName = prompt('重命名账号：', list[idx].label || '');
        if (newName && newName.trim()) { list[idx].label = newName.trim(); saveCreds(list); populateCredSelect(); showToast('已重命名', 'success'); }
      });
    });
  }

  function getSelectedCreds() {
    var box = document.getElementById('ocgCredList');
    if (!box) return [];
    var list = loadCreds();
    var selected = [];
    box.querySelectorAll('.ocg-cred-checkbox:checked').forEach(function (cb) {
      var idx = Number(cb.getAttribute('data-idx'));
      if (list[idx]) selected.push(list[idx]);
    });
    return selected;
  }

  // 额度本地缓存
  function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }
  function saveCache(data) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data })); } catch (e) {} }
  function getValidCache() {
    var c = loadCache();
    if (c && c.data && (Date.now() - c.ts) < CACHE_TTL) return c.data;
    return null;
  }

  function formatReset(sec) {
    sec = Number(sec) || 0;
    if (sec <= 0) return '即将重置';
    var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var parts = [];
    if (d) parts.push(d + '天');
    if (h) parts.push(h + '小时');
    if (m && !d && !h) parts.push(m + '分');
    if (!d && !h && !m) parts.push(s + '秒');
    return parts.join(' ');
  }

  function getThresholdClass(percent) {
    if (percent >= 95) return 'ocg-danger';
    if (percent >= 80) return 'ocg-warning';
    return 'ocg-ok';
  }

  function tsNow() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  var resetTimers = {};
  function startResetCountdown(accounts) {
    stopResetCountdown();
    var secs = {};
    accounts.forEach(function (acct, ai) {
      var items = acct.items || [];
      items.forEach(function (it, idx) {
        if (!it.sub || !it.sub.windows) return;
        secs[ai + ':' + idx] = {};
        PARSE_KEYS.forEach(function (k) { secs[ai + ':' + idx][k] = it.sub.windows[k] ? it.sub.windows[k].resetInSec : 0; });
      });
    });
    resetTimers._t = setInterval(function () {
      accounts.forEach(function (acct, ai) {
        var items = acct.items || [];
        items.forEach(function (it, idx) {
          var key = ai + ':' + idx;
          if (!secs[key]) return;
          PARSE_KEYS.forEach(function (k) {
            secs[key][k] = Math.max(0, secs[key][k] - POLL_INTERVAL / 1000);
            var el = document.querySelector('.ocg-progress-reset[data-acct="' + ai + '"][data-ws="' + idx + '"][data-key="' + k + '"]');
            if (el) el.textContent = '重置 ' + formatReset(secs[key][k]);
          });
        });
      });
    }, POLL_INTERVAL);
  }
  function stopResetCountdown() { if (resetTimers._t) { clearInterval(resetTimers._t); resetTimers._t = null; } }

  function renderDashboard(payload) {
    var els = getEls();
    var accounts = payload.accounts || [];
    state.result = payload;
    state.error = null;
    var totalAccts = accounts.length;

    // 分页：一页一个账号
    var perPage = 1;
    var totalPages = Math.max(1, Math.ceil(totalAccts / perPage));
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;
    var page = state.currentPage;
    var start = (page - 1) * perPage;
    var pageAccounts = accounts.slice(start, start + perPage);

    var html = '';

    // 分页导航（顶部）
    if (totalAccts > perPage) {
      html += '<div class="ocg-pagination">';
      html += '<button class="small-btn" id="ocgPrevPageBtn" type="button"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>';
      html += '<span class="ocg-page-info">账号 ' + page + ' / ' + totalPages + '（共 ' + totalAccts + '）</span>';
      html += '<button class="small-btn" id="ocgNextPageBtn" type="button"' + (page >= totalPages ? ' disabled' : '') + '>下一页</button>';
      html += '</div>';
    }

    pageAccounts.forEach(function (acct, ai) {
      var realIdx = start + ai;
      var items = acct.items || [];
      var acctLabel = acct.email || ('账号 ' + (realIdx + 1));
      html += '<div class="ocg-account-block">';
      html += '<div class="ocg-account-header">🔑 账号 ' + (realIdx + 1) + ' / ' + totalAccts + '：<b>' + escapeHtml(acctLabel) + '</b></div>';

      if (acct.error) {
        html += '<div class="ocg-account-error">❌ ' + escapeHtml(acct.error) + '</div>';
        html += '</div>';
        return;
      }

      if (!items.length) {
        html += '<div class="ocg-account-error">未发现工作区</div>';
        html += '</div>';
        return;
      }

      items.forEach(function (it, idx) {
        var ws = it.workspace || {};
        var wid = ws.id || '';
        var name = ws.name || ws.slug || wid;
        html += '<div class="ocg-ws-block">';
        html += '<div class="ocg-ws-header">📁 ' + escapeHtml(name) + ' <span class="ocg-ws-id">' + escapeHtml(wid) + '</span></div>';

        if (!it.sub) {
          html += '<div class="ocg-ws-empty">❌ 未开通 Go 订阅' + (it.error ? '（' + escapeHtml(it.error) + '）' : '') + '</div>';
          html += '</div>';
          return;
        }

        var owner = it.sub.mine ? '👤 我的订阅' : '👥 他人订阅';
        var balance = it.sub.useBalance ? '💰 使用余额支付' : '💳 不扣余额';
        html += '<div class="ocg-ws-meta">' + owner + '  |  ' + balance + (it.viaRpc ? '  |  <span class="ocg-src-rpc">RPC</span>' : '  |  <span class="ocg-src-html">HTML</span>') + '</div>';

        PARSE_KEYS.forEach(function (k) {
          var w = (it.sub.windows && it.sub.windows[k]) || { percent: 0, resetInSec: 0 };
          var pct = Math.max(0, Math.min(100, Number(w.percent) || 0));
          var cls = getThresholdClass(pct);
          var labelMap = { rolling: 'Rolling · 5 小时滚动', weekly: 'Weekly · 周额度', monthly: 'Monthly · 月额度' };
          html += '<div class="ocg-progress-card ' + cls + '">';
          html += '<div class="ocg-progress-top"><span class="ocg-progress-name">' + labelMap[k] + '</span><span class="ocg-progress-pct">' + pct.toFixed(1) + '%</span></div>';
          html += '<div class="ocg-progress-track"><div class="ocg-progress-bar" style="width:' + pct + '%"></div></div>';
          html += '<div class="ocg-progress-meta"><span class="ocg-progress-used">已用 ' + pct.toFixed(1) + '%</span><span class="ocg-progress-reset" data-acct="' + realIdx + '" data-ws="' + idx + '" data-key="' + k + '">重置 ' + formatReset(w.resetInSec) + '</span></div>';
          html += '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    });

    // 分页导航（底部）
    if (totalAccts > perPage) {
      html += '<div class="ocg-pagination">';
      html += '<button class="small-btn" id="ocgPrevPageBtn2" type="button"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>';
      html += '<span class="ocg-page-info">账号 ' + page + ' / ' + totalPages + '</span>';
      html += '<button class="small-btn" id="ocgNextPageBtn2" type="button"' + (page >= totalPages ? ' disabled' : '') + '>下一页</button>';
      html += '</div>';
    }

    html += '<div class="ocg-refresh-meta"><span class="ocg-refresh-time">共 ' + totalAccts + ' 个账号 · 更新于 ' + tsNow() + '</span></div>';
    els.resultArea.innerHTML = html;

    // 绑定分页按钮
    function bindPager(prevId, nextId) {
      var p = document.getElementById(prevId), n = document.getElementById(nextId);
      if (p) p.addEventListener('click', function () { if (state.currentPage > 1) { state.currentPage--; renderDashboard(state.result); } });
      if (n) n.addEventListener('click', function () { if (state.currentPage < totalPages) { state.currentPage++; renderDashboard(state.result); } });
    }
    bindPager('ocgPrevPageBtn', 'ocgNextPageBtn');
    bindPager('ocgPrevPageBtn2', 'ocgNextPageBtn2');

    startResetCountdown(accounts);
  }

  function stopPoll() {
    state.polling = false;
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    stopResetCountdown();
  }

  function startPoll(cookies, onlyWorkspaceId) {
    stopPoll();
    state.polling = true;
    doFetch(cookies, onlyWorkspaceId);
    state.pollTimer = setInterval(function () { doFetch(cookies, onlyWorkspaceId, true); }, POLL_INTERVAL);
  }

  function doFetch(cookies, onlyWorkspaceId, silent) {
    var els = getEls();
    state.loading = true;
    if (!silent) els.resultArea.innerHTML = '<div class="ocg-loading"><span>查询中（' + cookies.length + ' 个账号）...</span></div>';
    fetchUsage(cookies, onlyWorkspaceId).then(function (payload) {
      state.loading = false;
      // 自动刷新保留当前分页
      if (!silent) state.currentPage = 1;
      saveCache(payload);
      renderDashboard(payload);
    }).catch(function (err) {
      state.loading = false;
      state.error = err;
      if (!silent) {
        var msg = err && (err.message || String(err)) || '';
        var hint = '请确认 auth cookie 正确（浏览器登录 opencode.ai 后的 session cookie，不是 sk- 开头的 API Key），cookie 过期后需重新获取。';
        els.resultArea.innerHTML =
          '<div class="ocg-error"><div class="ocg-error-icon">⚠️</div>' +
          '<div class="ocg-error-text">' + escapeHtml(msg) + '</div>' +
          '<p class="ocg-error-hint">' + hint + '</p></div>';
      }
      stopPoll();
    });
  }

  function getEls() {
    return {
      modal: document.getElementById('opCodeGoModal'),
      cookieInput: document.getElementById('ocgCookieInput'),
      workspaceInput: document.getElementById('ocgWorkspaceInput'),
      saveCredBtn: document.getElementById('ocgSaveCredBtn'),
      importCredBtn: document.getElementById('ocgImportCredBtn'),
      selectAllCredBtn: document.getElementById('ocgSelectAllCredBtn'),
      poolToggleBtn: document.getElementById('ocgPoolToggleBtn'),
      clearPoolBtn: document.getElementById('ocgClearPoolBtn'),
      queryBtn: document.getElementById('ocgQueryBtn'),
      refreshBtn: document.getElementById('ocgRefreshBtn'),
      resultArea: document.getElementById('ocgResultArea'),
      closeBtn: document.getElementById('ocgCloseBtn'),
      closeFooterBtn: document.getElementById('ocgCloseFooterBtn')
    };
  }

  function readInputs() {
    var raw = getEls().cookieInput.value || '';
    // 多行 cookie 账号池：一行一个，去空、去重、过滤 sk-
    var cookies = raw.split(/\n/).map(function (c) { return c.trim(); }).filter(Boolean);
    cookies = cookies.filter(function (c) { return !isAuthCookieLooksLikeApiKey(c); });
    return { cookies: cookies, workspaceId: getEls().workspaceInput.value.trim() };
  }

  function doQuery() {
    var v = readInputs();
    if (!v.cookies.length) {
      if (rawHasSk()) {
        window.showToast('检测到 sk- 开头的 API Key，应为浏览器 session cookie（非 sk-）', 'warning');
      } else {
        window.showToast('请至少填写一个 auth cookie', 'warning');
      }
      getEls().cookieInput.focus();
      return;
    }
    if (!v.workspaceId) {
      window.showToast('开始查询 ' + v.cookies.length + ' 个账号...', 'info');
    }
    startPoll(v.cookies, v.workspaceId || null);
  }

  function rawHasSk() {
    var raw = getEls().cookieInput.value || '';
    return /\bsk-/i.test(raw);
  }

  function init() {
    var els = getEls();
    if (!els.modal) return;

    populateCredSelect();

    if (els.saveCredBtn) {
              els.saveCredBtn.addEventListener('click', function () {
                var v = readInputs();
                if (!v.cookies.length) { window.showToast('账号池为空', 'warning'); return; }
                if (rawHasSk()) { window.showToast('检测到 sk- 开头，已过滤', 'warning'); }
                var existing = loadCreds();
                var existingCookies = existing.map(function (c) { return c.cookie; });
                var added = 0;
                v.cookies.forEach(function (ck) {
                  if (existingCookies.indexOf(ck) !== -1) return;
                  addCred(ck, '账号 ' + (existing.length + added + 1));
                  added++;
                });
                populateCredSelect();
                window.showToast(added > 0 ? '已保存 ' + added + ' 个' : '均已存在', added > 0 ? 'success' : 'info');
              });
            }
            if (els.importCredBtn) {
              els.importCredBtn.addEventListener('click', function () {
                var selected = getSelectedCreds();
                if (!selected.length) { window.showToast('请先勾选要导入的凭据', 'warning'); return; }
                // 清空后再导入
                var existing = [];
                var set = {};
                var added = 0;
                selected.forEach(function (c) {
                  var ck = (c.cookie || '').trim();
                  if (ck && !set[ck]) { existing.push(ck); set[ck] = true; added++; }
                });
                els.cookieInput.value = existing.join('\n');
                window.showToast('已导入 ' + added + ' 个凭据到账号池', 'success');
              });
            }
            if (els.clearPoolBtn) {
              els.clearPoolBtn.addEventListener('click', function () {
                els.cookieInput.value = '';
                window.showToast('已清空', 'success');
              });
            }
            if (els.selectAllCredBtn) {
              els.selectAllCredBtn.addEventListener('click', function () {
                var box = document.getElementById('ocgCredList');
                if (!box) return;
                var cbs = box.querySelectorAll('.ocg-cred-checkbox');
                if (!cbs.length) return;
                var allChecked = true;
                cbs.forEach(function (cb) { if (!cb.checked) allChecked = false; });
                cbs.forEach(function (cb) { cb.checked = !allChecked; });
              });
            }

        if (els.poolToggleBtn) {
              els.poolToggleBtn.addEventListener('click', function () {
                var textarea = els.cookieInput;
                if (!textarea) return;
                var isHidden = textarea.style.webkitTextSecurity === 'disc' || textarea.style.webkitTextSecurity === '';
                textarea.style.webkitTextSecurity = isHidden ? 'none' : 'disc';
                els.poolToggleBtn.textContent = isHidden ? '👁 显示' : '🔒 隐藏';
              });
            }

    if (els.queryBtn) els.queryBtn.addEventListener('click', doQuery);

    els.closeBtn.addEventListener('click', function () { stopPoll(); closeModal(); });
    els.closeFooterBtn.addEventListener('click', function () { stopPoll(); closeModal(); });
    els.modal.addEventListener('click', function (e) { if (e.target === els.modal) { stopPoll(); closeModal(); } });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && els.modal.classList.contains('active')) { stopPoll(); closeModal(); }
    });
  }

  function openModal() { var els = getEls(); if (els.modal) els.modal.classList.add('active'); }
  function closeModal() { var els = getEls(); if (els.modal) els.modal.classList.remove('active'); }

  function openModalWithCache() {
    var els = getEls();
    try {
      var cached = getValidCache();
      if (cached) renderDashboard(cached);
      else {
        els.resultArea.innerHTML = '<div class="ocg-placeholder">填 cookie 后点「查询」查看三级额度。可勾选已保存凭据 → 导入选中到账号池。</div>';
      }
      if (document.getElementById('ocgCredList')) populateCredSelect();
      var cookieEl = els.cookieInput;
      if (cookieEl) {
        cookieEl.style.webkitTextSecurity = 'disc';
        if (els.poolToggleBtn) els.poolToggleBtn.textContent = '👁 显示';
      }
    } catch (e) {
      console.error('OpCode Go open error:', e);
    }
    if (els.modal) els.modal.classList.add('active');
    try {
      var cached = getValidCache();
      if (cached) {
        var v = readInputs();
        if (v.cookies.length) doFetch(v.cookies, v.workspaceId || null, true);
      }
    } catch (e2) { console.error('OpCode Go cache refresh error:', e2); }
  }

  window.openOpCodeGoModal = openModalWithCache;
  window.initOpCodeGo = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { try { init(); } catch (e) { console.error('OpCode Go init error:', e); } });
  } else {
    try { init(); } catch (e) { console.error('OpCode Go init error:', e); }
  }
})();