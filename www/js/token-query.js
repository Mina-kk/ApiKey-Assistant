/**
 * 令牌查询 / 模型调用使用查询
 * 对应后端 API: /api/usage/token/ + /api/log/token
 */
(function () {
  'use strict';

  // ========== 状态 ==========
  var queryState = {
    loading: false,
    result: null,
    logs: [],
    currentPage: 1,
    pageSize: 20,
    chartData: null,
    hiddenModels: {}
  };

  var CHART_COLORS = ['#38bdf8','#8b5cf6','#34d399','#fbbf24','#fb7185','#a78bfa','#2dd4bf','#f472b6','#f97316','#14b8a6','#818cf8','#c084fc','#6ee7b7','#fde047','#fca5a5'];

  // ========== HTTP 请求（复用项目现有能力）==========
  function doTokenQuery(method, url, headers, body, timeoutMs) {
    if (typeof requestViaLocalProxyOrDirect === 'function') {
      return requestViaLocalProxyOrDirect(method, url, headers, body, timeoutMs, true, false);
    }
    return new Promise(function (resolve, reject) {
      var finished = false;
      var timer = null;

      function done(ok, value) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        ok ? resolve(value) : reject(value);
      }

      if (timeoutMs && timeoutMs > 0) {
        timer = setTimeout(function () { done(false, new Error('请求超时')); }, timeoutMs);
      }

      if (window.AndroidBridge && typeof window.AndroidBridge.httpRequest === 'function') {
        try {
          var nativeRaw = window.AndroidBridge.httpRequest(method, url, JSON.stringify(headers || {}), body || '');
          var nativeResp = JSON.parse(nativeRaw || '{}');
          if (nativeResp.ok) done(true, nativeResp.body || '');
          else done(false, new Error('Native HTTP ' + (nativeResp.status || 0) + ' ' + (nativeResp.error || nativeResp.body || '')));
        } catch (e) { done(false, e); }
        return;
      }

      if (window.cordova && typeof cordova.exec === 'function') {
        try {
          cordova.exec(function (nativeResp) {
            try {
              if (typeof nativeResp === 'string') nativeResp = JSON.parse(nativeResp || '{}');
              if (nativeResp.ok) done(true, nativeResp.body || '');
              else done(false, new Error('NativeHttp ' + (nativeResp.status || 0) + ' ' + (nativeResp.error || nativeResp.body || '')));
            } catch (e) { done(false, e); }
          }, function (err) {
            var msg = typeof err === 'string' ? err : JSON.stringify(err || {});
            done(false, new Error('NativeHttp plugin failed: ' + msg));
          }, 'NativeHttp', 'request', [method, url, JSON.stringify(headers || {}), body || '', timeoutMs || 30000]);
        } catch (e) { done(false, e); }
        return;
      }

      var controller = new AbortController();
      var opts = { method: method, headers: headers || {}, signal: controller.signal };
      if (body) opts.body = body;
      if (timeoutMs && timeoutMs > 0) setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs);

      fetch(url, opts)
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (text) { done(true, text); })
        .catch(function (e) { done(false, e); });
    });
  }

  // ========== API 调用 ==========

  function fetchTokenUsage(baseUrl, apiKey) {
    var url = normalizeBaseUrl(baseUrl) + '/api/usage/token/';
    var headers = { 'Authorization': 'Bearer ' + apiKey };
    return doTokenQuery('GET', url, headers, null, 15000).then(function (raw) {
      var text = String(raw || '').trim();
      if (!text) throw new Error('接口返回为空');
      var data = JSON.parse(text);
      if (data.data) {
        var d = data.data;
        return {
          tokenName: d.name || '',
          totalGranted: Number(d.total_granted) || 0,
          totalUsed: Number(d.total_used) || 0,
          totalAvailable: Number(d.total_available) || 0,
          unlimitedQuota: !!d.unlimited_quota,
          expiresAt: Number(d.expires_at) || 0,
          tokenValid: true
        };
      }
      throw new Error(data.message || '查询令牌信息失败');
    });
  }

  function fetchTokenLogs(baseUrl, apiKey) {
    var url = baseUrl.replace(/\/+$/, '') + '/api/log/token';
    var headers = { 'Authorization': 'Bearer ' + apiKey };
    return doTokenQuery('GET', url, headers, null, 15000).then(function (raw) {
      var text = String(raw || '').trim();
      if (!text) throw new Error('接口返回为空');
      var data = JSON.parse(text);
      if (data.success && Array.isArray(data.data)) {
        return data.data;
      }
      if (data.code === 0 && Array.isArray(data.data)) {
        return data.data;
      }
      throw new Error(data.message || '查询调用日志失败');
    });
  }

  // ========== 渲染 ==========

  function aggregateLogs(logs) {
    if (!logs || !logs.length) return null;
    var dateMap = {};
    var modelSet = {};
    var totalRequests = 0;
    var totalTokens = 0;
    var totalCost = 0;
    var totalTime = 0;

    logs.forEach(function (log) {
      if (log.type !== 0 && log.type !== 2) return;
      var d = new Date(Number(log.created_at) * 1000);
      var key = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      var label = (d.getMonth() + 1) + '月' + pad(d.getDate()) + '日';
      var model = log.model_name || '未知';
      if (!dateMap[key]) dateMap[key] = { label: label, models: {}, total: 0 };
      if (!dateMap[key].models[model]) dateMap[key].models[model] = 0;
      var tokens = (Number(log.prompt_tokens) || 0) + (Number(log.completion_tokens) || 0);
      dateMap[key].models[model] += tokens;
      dateMap[key].total += tokens;
      modelSet[model] = true;
      totalRequests++;
      totalTokens += tokens;
      totalCost += Number(log.quota) || 0;
      totalTime += Number(log.use_time) || 0;
    });

    var dates = Object.keys(dateMap).sort();
    var models = Object.keys(modelSet).sort();
    var chartDates = [];
    var chartSeries = [];
    models.forEach(function (m, idx) {
      chartSeries.push({ name: m, color: CHART_COLORS[idx % CHART_COLORS.length], data: [] });
    });
    dates.forEach(function (key) {
      var day = dateMap[key];
      chartDates.push(day.label);
      chartSeries.forEach(function (s) {
        s.data.push(day.models[s.name] || 0);
      });
    });
    var allVals = [];
    chartSeries.forEach(function (s) { allVals = allVals.concat(s.data); });
    var maxVal = Math.max.apply(null, allVals);

    return {
      dates: chartDates,
      series: chartSeries,
      maxVal: maxVal || 1,
      totalRequests: totalRequests,
      totalTokens: totalTokens,
      totalCost: totalCost,
      totalTime: totalTime,
      modelCount: models.length
    };
  }

  function getStackedMax(series) {
    var totals = {};
    series.forEach(function (s) {
      s.data.forEach(function (v, i) {
        totals[i] = (totals[i] || 0) + v;
      });
    });
    return Math.max.apply(null, Object.keys(totals).map(function (i) { return totals[i]; })) || 1;
  }

  function getNiceTicks(max) {
    var raw = Number(max) || 1;
    var magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    var normalized = raw / magnitude;
    var step;
    if (normalized <= 1) step = 0.2;
    else if (normalized <= 2) step = 0.5;
    else if (normalized <= 5) step = 1;
    else step = 2;
    step = step * magnitude;
    var niceMax = Math.ceil(raw / step) * step;
    var ticks = [];
    for (var v = 0; v <= niceMax + step * 0.001; v += step) {
      ticks.push(v);
    }
    return ticks;
  }

  function renderResults() {
    var els = getTqEls();
    var info = queryState.result;
    var chart = queryState.chartData;
    var html = '';

    if (info) {
      html += '<div class="tq-token-card">';
      html += '<div class="tq-token-header"><div class="tq-token-icon">\u{1f511}</div><div class="tq-token-name">' + escapeHtml(info.tokenName || '未知') + '</div></div>';
      html += '<div class="tq-token-stats">';
      html += '<div class="tq-stat-item"><div class="tq-stat-label">总额度</div><div class="tq-stat-value">' + (info.unlimitedQuota ? '无限额度' : formatQuota(info.totalGranted)) + '</div></div>';
      html += '<div class="tq-stat-item"><div class="tq-stat-label">已使用</div><div class="tq-stat-value tq-stat-used">' + (info.unlimitedQuota ? '---' : formatQuota(info.totalUsed)) + '</div></div>';
      html += '<div class="tq-stat-item"><div class="tq-stat-label">剩余额度</div><div class="tq-stat-value tq-stat-avail">' + (info.unlimitedQuota ? '无限制' : formatQuota(info.totalAvailable)) + '</div></div>';
      html += '<div class="tq-stat-item"><div class="tq-stat-label">有效期</div><div class="tq-stat-value">' + (info.expiresAt === 0 ? '永不过期' : timestampStr(info.expiresAt)) + '</div></div>';
      html += '</div></div>';
    }

    if (chart) {
      var avgTime = chart.totalRequests ? Math.round(chart.totalTime / chart.totalRequests) : 0;
      html += '<div class="tq-stats-summary">';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + chart.totalRequests + '</span><span class="tq-summary-label">总请求</span></div>';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + formatQuota(chart.totalTokens) + '</span><span class="tq-summary-label">Token消耗</span></div>';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + formatQuota(chart.totalCost) + '</span><span class="tq-summary-label">总花费</span></div>';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + chart.modelCount + '</span><span class="tq-summary-label">模型数</span></div>';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + avgTime + 's</span><span class="tq-summary-label">平均耗时</span></div>';
      html += '</div>';
    }

    if (chart && chart.dates.length) {
      html += '<div class="tq-chart-section"><div class="tq-chart-toolbar"><h3 class="tq-section-title">Token消耗趋势</h3><select id="tqModelFilter" style="display:none"><option value="">全部模型</option></select></div>';
      html += '<div class="tq-chart-wrap"><canvas id="tqChartCanvas" class="tq-chart-canvas"></canvas></div>';
      html += '<div class="tq-legend" id="tqLegend"></div></div>';
    } else {
      html += '<div class="tq-empty-logs">暂无调用记录</div>';
    }

    // 模型调用记录表
    var logs = queryState.logs || [];
    if (logs.length) {
      html += '<div class="tq-log-section" id="tqLogSection"></div>';
    }

    els.resultArea.innerHTML = html;
    if (chart && chart.dates.length) { buildFilter(); renderChart(); }
    if (logs.length) { renderLogTable(); }
  }

  function renderLogTable() {
    var logSection = document.getElementById('tqLogSection');
    if (!logSection) return;
    var logs = queryState.logs || [];
    var page = queryState.currentPage;
    var pageSize = queryState.pageSize;
    var total = logs.length;
    var totalPages = Math.ceil(total / pageSize);
    var start = (page - 1) * pageSize;
    var end = Math.min(start + pageSize, total);
    var pageLogs = logs.slice(start, end);

    var html = '';
    html += '<div class="tq-log-header">';
    html += '<h3 class="tq-log-title">模型调用记录 <span class="tq-log-count">（共 ' + total + ' 条，第' + page + '/' + totalPages + '页）</span></h3>';
    html += '<div class="tq-log-actions">';
    html += '<button class="small-btn" id="tqCopyLogsBtn" type="button">复制</button>';
    html += '</div></div>';

    if (pageLogs.length) {
      html += '<div class="tq-log-table-wrap">';
      html += '<table class="tq-log-table">';
      html += '<thead><tr><th>时间</th><th>模型</th><th>输入</th><th>输出</th></tr></thead>';
      html += '<tbody>';
      for (var j = 0; j < pageLogs.length; j++) {
        var log = pageLogs[j];
        var time = log.created_at ? timestampStr(log.created_at) : '—';
        var model = log.model_name || '—';
        var isComplete = (log.type === 0 || log.type === 2);
        var promptTokens = isComplete ? (log.prompt_tokens != null ? log.prompt_tokens : '—') : '—';
        var compTokens = isComplete ? (log.completion_tokens != null ? log.completion_tokens : '—') : '—';
        html += '<tr>' +
          '<td class="tq-cell-time">' + time + '</td>' +
          '<td class="tq-cell-model"><span class="tq-model-tag">' + escapeHtml(model) + '</span></td>' +
          '<td class="tq-cell-num">' + promptTokens + '</td>' +
          '<td class="tq-cell-num">' + compTokens + '</td>' +
        '</tr>';
      }
      html += '</tbody></table></div>';

      // 分页
      if (totalPages > 1) {
        html += '<div class="tq-pagination">';
        html += '<button class="small-btn" id="tqPrevPageBtn" type="button"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>';
        html += '<span class="tq-page-info">' + page + '/' + totalPages + '</span>';
        html += '<button class="small-btn" id="tqNextPageBtn" type="button"' + (page >= totalPages ? ' disabled' : '') + '>下一页</button>';
        html += '</div>';
      }
    } else {
      html += '<div class="tq-empty-logs">暂无调用记录</div>';
    }

    logSection.innerHTML = html;

    // 复制按钮
    var copyBtn = document.getElementById('tqCopyLogsBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var header = '时间\t模型\t提示Tokens\t补全Tokens\t花费\t用时\n';
        var txt = header;
        for (var k = 0; k < logs.length; k++) {
          var l = logs[k];
          txt += (l.created_at ? timestampStr(l.created_at) : '—') + '\t' +
            (l.model_name || '—') + '\t' +
            ((l.type === 0 || l.type === 2) ? (l.prompt_tokens != null ? l.prompt_tokens : '—') : '—') + '\t' +
            ((l.type === 0 || l.type === 2) ? (l.completion_tokens != null ? l.completion_tokens : '—') : '—') + '\t' +
            ((l.type === 0 || l.type === 2) ? formatQuota(l.quota) : '—') + '\t' +
            (l.use_time != null ? l.use_time + 's' : '—') + '\n';
        }
        if (typeof window.copyText === 'function') {
          window.copyText(txt, '调用记录已复制');
        }
      });
    }

    // 翻页
    var prevBtn = document.getElementById('tqPrevPageBtn');
    var nextBtn = document.getElementById('tqNextPageBtn');
    if (prevBtn) prevBtn.addEventListener('click', function () { if (queryState.currentPage > 1) { queryState.currentPage--; renderLogTable(); } });
    if (nextBtn) nextBtn.addEventListener('click', function () { if (queryState.currentPage < totalPages) { queryState.currentPage++; renderLogTable(); } });
  }

  function renderChart() {
    var canvas = document.getElementById("tqChartCanvas");
    if (!canvas) return;
    var chart = queryState.chartData;
    if (!chart || !chart.dates.length) return;
    var filterEl = document.getElementById("tqModelFilter");
    var filteredSeries = chart.series;
    if (filterEl && filterEl.value) {
      filteredSeries = chart.series.filter(function(s){ return s.name === filterEl.value });
    }
    // 排除被点击隐藏的模型
    filteredSeries = filteredSeries.filter(function (s) { return !queryState.hiddenModels[s.name]; });
    if (!filteredSeries.length) filteredSeries = chart.series.filter(function (s) { return !queryState.hiddenModels[s.name]; });
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.parentElement.clientWidth - 8;
    if (w > 660) w = 660;
    var h = 350;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    var pad = { top: 24, right: 16, bottom: 52, left: 56 };
    var pw = w - pad.left - pad.right;
    var ph = h - pad.top - pad.bottom;
    var n = chart.dates.length;
    var gw = pw / n;
    var bw = Math.min(gw * 0.45, 28);
    var max = getStackedMax(filteredSeries);
    if (max === 0) max = 1;
    // 生成刻度值：nice round numbers
    var ticks = getNiceTicks(max);
    var tickMax = ticks[ticks.length - 1];
    ctx.clearRect(0, 0, w, h);
    ticks.forEach(function (tickVal) {
      var ratio = tickVal / tickMax;
      var y = pad.top + ph - ratio * ph;
      ctx.strokeStyle = "rgba(148,163,184,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right + 2, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.textAlign = "right";
      ctx.font = "11px sans-serif";
      ctx.fillText(shortNum(tickVal), pad.left - 8, y + 4);
    });
    ctx.strokeStyle = "rgba(148,163,184,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + ph);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + ph);
    ctx.lineTo(w - pad.right + 2, pad.top + ph);
    ctx.stroke();
    var stacks = {};
    filteredSeries.forEach(function(s, si) {
      ctx.fillStyle = s.color;
      s.data.forEach(function(val, di) {
        if (val <= 0) return;
        if (!stacks[di]) stacks[di] = 0;
        var x = pad.left + gw * di + (gw - bw) / 2;
        var bh = (val / max) * ph;
        var y = pad.top + ph - stacks[di] - bh;
        stacks[di] += bh;
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(bw), Math.round(bh));
      });
    });
    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var skip = Math.max(1, Math.floor(n / 5));
    chart.dates.forEach(function(label, i) {
      if (i % skip !== 0 && i !== n - 1) return;
      ctx.fillText(label, pad.left + gw * i + gw / 2, pad.top + ph + 10);
    });
    renderLegend();
  }

  function renderLegend() {
    var el = document.getElementById('tqLegend');
    if (!el) return;
    var chart = queryState.chartData;
    if (!chart || !chart.series.length) return;
    el.innerHTML = chart.series.map(function (s) {
      var hidden = !!queryState.hiddenModels[s.name];
      var cls = hidden ? 'tq-legend-item hidden' : 'tq-legend-item';
      return '<span class="' + cls + '" data-model="' + escapeAttr(s.name) + '"><span class="tq-legend-dot" style="background:' + s.color + '"></span><span class="tq-legend-label">' + escapeHtml(s.name) + '</span></span>';
    }).join('');
    // 点击切换隐藏/显示
    el.querySelectorAll('.tq-legend-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var model = item.dataset.model;
        if (queryState.hiddenModels[model]) {
          delete queryState.hiddenModels[model];
        } else {
          queryState.hiddenModels[model] = true;
        }
        renderChart();
        renderLegend();
      });
    });
  }

  function shortNum(n) {
    n = Number(n);
    if (n >= 1000000) return (n / 1000000).toFixed(0) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
    return String(Math.round(n));
  }

  function buildFilter(){
    var sel=document.getElementById("tqModelFilter");
    if(!sel||!queryState.chartData)return;
    sel.innerHTML="<option value=\"\">全部模型</option>";
    queryState.chartData.series.forEach(function(s){
      sel.innerHTML+="<option value=\""+escapeHtml(s.name)+"\">"+escapeHtml(s.name)+"</option>"
    });
    sel.style.display="";
    sel.onchange=function(){renderChart()}
  }

  function renderTokenQueryModal(baseUrl, apiKey) {
    var els = getTqEls();
    els.resultArea.innerHTML = '<div class="tq-loading"><span>查询中...</span></div>';
    queryState.loading = true;

    var p1 = fetchTokenUsage(baseUrl, apiKey);
    var p2 = fetchTokenLogs(baseUrl, apiKey);

    Promise.all([p1, p2]).then(function (results) {
      queryState.result = results[0];
      queryState.logs = results[1];
      queryState.chartData = aggregateLogs(results[1]);
      queryState.loading = false;
      renderResults();
    }).catch(function (err) {
      queryState.loading = false;
      queryState.result = null;
      queryState.logs = [];
      els.resultArea.innerHTML =
        '<div class="tq-error">' +
          '<div class="tq-error-icon">⚠️</div>' +
          '<div class="tq-error-text">' + escapeHtml(err.message || String(err)) + '</div>' +
          '<p class="tq-error-hint">请检查 NewAPI 服务器地址和令牌是否正确，确保中转站已开启。</p>' +
        '</div>';
    });
  }

  function formatQuota(quota) {
    if (quota == null) return '\u2014';
    quota = Number(quota);
    if (quota >= 1000000) return (quota / 1000000).toFixed(2) + 'M';
    if (quota >= 1000) return (quota / 1000).toFixed(2) + 'K';
    return String(quota);
  }

  function timestampStr(ts) {
    if (!ts && ts !== 0) return '—';
    try {
      var d = new Date(Number(ts) * 1000);
      if (isNaN(d.getTime())) return '—';
      var Y = d.getFullYear();
      var M = pad(d.getMonth() + 1);
      var D = pad(d.getDate());
      var h = pad(d.getHours());
      var m = pad(d.getMinutes());
      var s = pad(d.getSeconds());
      return Y + '-' + M + '-' + D + ' ' + h + ':' + m + ':' + s;
    } catch (e) { return '—'; }
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function getTqEls() {
    return {
      modal: document.getElementById('tokenQueryModal'),
      channelSelect: document.getElementById('tqChannelSelect'),
      serverUrlInput: document.getElementById('tqServerUrlInput'),
      apiKeyInput: document.getElementById('tqApiKeyInput'),
      queryBtn: document.getElementById('tqQueryBtn'),
      resultArea: document.getElementById('tqResultArea'),
      closeBtn: document.getElementById('tqCloseBtn'),
      closeFooterBtn: document.getElementById('tqCloseFooterBtn'),
      saveUrlBtn: document.getElementById('tqSaveUrlBtn'),
      urlToggleBtn: document.getElementById('tqUrlToggleBtn')
    };
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeBaseUrl(url) {
    if (!url) return '';
    url = String(url).trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace(/\/+$/, '');
    return url;
  }

  function doCopyText(text) {
    if (typeof window.copyText === 'function') {
      window.copyText(text);
      if (typeof window.showToast === 'function') showToast('已复制调用记录', 'success');
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        if (typeof window.showToast === 'function') showToast('已复制调用记录', 'success');
      }).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (typeof window.showToast === 'function') showToast('已复制调用记录', 'success');
  }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    }
  }

  // ========== 初始化与事件绑定 ==========

  function populateChannelSelect() {
    var sel = getTqEls().channelSelect;
    var channels = (typeof AppState !== "undefined" && AppState.channels) || [];
    var groups = {};
    channels.forEach(function (ch) {
      var g = ch.group || "default";
      if (!groups[g]) groups[g] = [];
      groups[g].push(ch);
    });
    var html = '<option value="" data-key="">-- 手动输入 --</option>';
    var groupNames = Object.keys(groups).sort();
    groupNames.forEach(function (g) {
      html += '<optgroup label="' + escapeHtml(g) + '">';
      groups[g].forEach(function (ch) {
        var url = (ch.base_url || "").replace(/\/v[1-4]\/?$/i, "");
        var name = escapeHtml(ch.name || "");
        var keys = ch.keys || [];
        if (keys.length) {
          keys.forEach(function (k, ki) {
            var keyVal = escapeHtml(k.value || "");
            var keyLabel = escapeHtml(k.label || "Key " + (ki + 1));
            html += '<option value="' + escapeHtml(url) + '" data-key="' + keyVal + '">' + name + " / " + keyLabel + "</option>";
          });
        } else {
          html += '<option value="' + escapeHtml(url) + '" data-key="">' + name + " / 无 Key</option>";
        }
      });
      html += "</optgroup>";
    });
    sel.innerHTML = html;
  }

  function initTokenQuery() {
    var els = getTqEls();
    if (!els.modal) return;

    els.channelSelect.addEventListener('change', function () {
      var opt = els.channelSelect.options[els.channelSelect.selectedIndex];
      if (opt && opt.value) {
        els.serverUrlInput.value = opt.value;
        var key = opt.getAttribute('data-key') || '';
        if (key) els.apiKeyInput.value = key;
      }
    });

    els.queryBtn.addEventListener('click', doQuery);

    els.apiKeyInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doQuery();
    });
    els.serverUrlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doQuery();
    });

    els.closeBtn.addEventListener('click', function () { closeModal(); });
    els.closeFooterBtn.addEventListener('click', function () { closeModal(); });

    els.saveUrlBtn.addEventListener('click', function () {
      var url = els.serverUrlInput.value.trim();
      if (url) {
        try { localStorage.setItem('tq_server_url', url); } catch (e) {}
        showToast('服务器地址已保存', 'success');
      }
    });

    if (els.urlToggleBtn) {
      els.urlToggleBtn.addEventListener('click', function () {
        var isPassword = els.serverUrlInput.type === 'password';
        els.serverUrlInput.type = isPassword ? 'text' : 'password';
        els.urlToggleBtn.textContent = isPassword ? '🔒' : '👁';
      });
    }

    els.modal.addEventListener('click', function (e) {
      if (e.target === els.modal) closeModal();
    });
  }

  function doQuery() {
    var els = getTqEls();
    var baseUrl = els.serverUrlInput.value.trim();
    var apiKey = els.apiKeyInput.value.trim();

    if (!baseUrl) {
      showToast('请输入服务器地址', 'warning');
      els.serverUrlInput.focus();
      return;
    }
    if (!apiKey) {
      showToast('请输入要查询的令牌', 'warning');
      els.apiKeyInput.focus();
      return;
    }

    renderTokenQueryModal(baseUrl, apiKey);
  }

  function openTokenQueryModal() {
    var els = getTqEls();
    // 打开时清空输入，只有点了"保存"的才会从 localStorage 加载
    els.serverUrlInput.value = '';
    els.apiKeyInput.value = '';
    queryState.currentPage = 1;
    populateChannelSelect();
    els.modal.classList.add("active");
    els.resultArea.innerHTML = '<div class="tq-placeholder">仅支持 NewAPI 中转站，从下方渠道选择自动填入，或手动输入地址和令牌后点击"查询"查看使用统计与图表。</div>';
  }

  function closeModal() {
    var els = getTqEls();
    if (els.modal) els.modal.classList.remove('active');
    // 离开时清空输入，未点保存不保留
    if (els.serverUrlInput) els.serverUrlInput.value = '';
    if (els.apiKeyInput) els.apiKeyInput.value = '';
    queryState.currentPage = 1;
  }

  window.initTokenQuery = initTokenQuery;
  window.openTokenQueryModal = openTokenQueryModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTokenQuery);
  } else {
    initTokenQuery();
  }
})();
