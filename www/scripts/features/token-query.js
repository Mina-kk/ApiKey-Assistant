/**
 * 用量监控 / Token 使用量查询
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
  var ENDPOINTS_KEY = 'tq_saved_endpoints_v2';
  var BAR_WIDTH = 12;
  var BAR_GAP = 8;
  var CHART_HEIGHT = 280;

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

  // ========== 端点管理 ==========
  function loadEndpoints() {
    try {
      var raw = localStorage.getItem(ENDPOINTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveEndpoints(endpoints) {
    try { localStorage.setItem(ENDPOINTS_KEY, JSON.stringify(endpoints)); } catch (e) {}
  }

  function addEndpoint(url, apiKey, label) {
    var list = loadEndpoints();
    var exists = list.some(function (e) { return e.url === url; });
    if (exists) {
      // 更新已有端点的 key
      list.forEach(function (e) {
        if (e.url === url) e.apiKey = apiKey;
      });
      saveEndpoints(list);
      return list;
    }
    list.push({ url: url, apiKey: apiKey || '', label: label || url, addedAt: Date.now() });
    saveEndpoints(list);
    return list;
  }

  function removeEndpoint(url) {
    var list = loadEndpoints().filter(function (e) { return e.url !== url; });
    saveEndpoints(list);
    return list;
  }

  function populateSavedEndpoints() {
    var sel = document.getElementById('tqSavedEndpoints');
    if (!sel) return;
    var list = loadEndpoints();
    sel.innerHTML = '<option value="">-- 选择已保存端点 --</option>' +
      list.map(function (e) {
        return '<option value="' + escapeHtml(e.url) + '" data-key="' + escapeHtml(e.apiKey || '') + '">' + escapeHtml(e.label) + '</option>';
      }).join('');
    if (list.length) {
      sel.style.display = '';
    } else {
      sel.style.display = 'none';
    }
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

    // 令牌信息卡片
    if (info) {
      html += '<div class="tq-token-card">';
      html += '<div class="tq-token-header"><div class="tq-token-icon">🔑</div><div class="tq-token-name">' + escapeHtml(info.tokenName || '未知') + '</div></div>';
      html += '<div class="tq-token-stats">';
      html += '<div class="tq-stat-item"><div class="tq-stat-label">总配额</div><div class="tq-stat-value">' + (info.unlimitedQuota ? '无限制' : formatQuota(info.totalGranted)) + '</div></div>';
      html += '<div class="tq-stat-item"><div class="tq-stat-label">已消耗</div><div class="tq-stat-value tq-stat-used">' + (info.unlimitedQuota ? '---' : formatQuota(info.totalUsed)) + '</div></div>';
      html += '<div class="tq-stat-item"><div class="tq-stat-label">可用余额</div><div class="tq-stat-value tq-stat-avail">' + (info.unlimitedQuota ? '无限制' : formatQuota(info.totalAvailable)) + '</div></div>';
      html += '<div class="tq-stat-item"><div class="tq-stat-label">有效期</div><div class="tq-stat-value">' + (info.expiresAt === 0 ? '永不过期' : timestampStr(info.expiresAt)) + '</div></div>';
      html += '</div></div>';
    }

    // 统计摘要
    if (chart) {
      var avgTime = chart.totalRequests ? Math.round(chart.totalTime / chart.totalRequests) : 0;
      html += '<div class="tq-stats-summary">';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + chart.totalRequests + '</span><span class="tq-summary-label">总请求</span></div>';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + formatQuota(chart.totalTokens) + '</span><span class="tq-summary-label">Token 消耗</span></div>';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + formatQuota(chart.totalCost) + '</span><span class="tq-summary-label">总花费</span></div>';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + chart.modelCount + '</span><span class="tq-summary-label">模型数</span></div>';
      html += '<div class="tq-summary-item"><span class="tq-summary-num">' + avgTime + 's</span><span class="tq-summary-label">平均耗时</span></div>';
      html += '</div>';
    }

    // 图表区域
    if (chart && chart.dates.length) {
      html += '<div class="tq-chart-section">';
      html += '<div class="tq-chart-header">';
      html += '<h3 class="tq-chart-title">Token 消耗量</h3>';
      html += '<span class="tq-chart-subtitle">按模型细分的 Tokens 使用量</span>';
      html += '</div>';
      html += '<div class="tq-chart-filters">';
      html += '<select id="tqModelFilter"><option value="">全部模型</option></select>';
      html += '</div>';
      html += '<div class="tq-chart-body">';
      html += '<div class="tq-chart-yaxis"><canvas id="tqYAxisCanvas"></canvas></div>';
      html += '<div class="tq-chart-scroll"><canvas id="tqChartCanvas"></canvas></div>';
      html += '</div>';
      html += '<div class="tq-legend" id="tqLegend"></div>';
      html += '</div>';
    } else if (info) {
      html += '<div class="tq-empty-logs">暂无调用记录</div>';
    }

    // 日志卡片列表
    var logs = queryState.logs || [];
    if (logs.length) {
      html += '<div class="tq-log-section" id="tqLogSection"></div>';
    }

    els.resultArea.innerHTML = html;
    if (chart && chart.dates.length) { buildFilter(); renderYAxis(); renderChart(); renderLegend(); }
    if (logs.length) { renderLogCards(); }
  }

  // ========== Y轴渲染（固定左侧）==========
  function renderYAxis() {
    var canvas = document.getElementById('tqYAxisCanvas');
    if (!canvas) return;
    var chart = queryState.chartData;
    if (!chart || !chart.dates.length) return;
    var filteredSeries = getFilteredSeries();
    var max = getStackedMax(filteredSeries);
    if (max === 0) max = 1;
    var ticks = getNiceTicks(max);
    var tickMax = ticks[ticks.length - 1];

    var dpr = window.devicePixelRatio || 1;
    var w = 56;
    var h = CHART_HEIGHT;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var pad = { top: 20, right: 0, bottom: 36, left: 4 };
    var ph = h - pad.top - pad.bottom;
    ctx.clearRect(0, 0, w, h);

    ticks.forEach(function (tickVal) {
      var ratio = tickVal / tickMax;
      var y = pad.top + ph - ratio * ph;
      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.textAlign = 'right';
      ctx.font = '9px sans-serif';
      ctx.fillText(formatYLabel(tickVal), w - 4, y + 3);
    });

    ctx.fillStyle = 'rgba(148,163,184,0.2)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Tokens', w / 2, 10);
  }

  function getFilteredSeries() {
    var chart = queryState.chartData;
    if (!chart) return [];
    var filteredSeries = chart.series.slice();
    var filterEl = document.getElementById('tqModelFilter');
    if (filterEl && filterEl.value) {
      filteredSeries = filteredSeries.filter(function (s) { return s.name === filterEl.value; });
    }
    filteredSeries = filteredSeries.filter(function (s) { return !queryState.hiddenModels[s.name]; });
    if (!filteredSeries.length) filteredSeries = chart.series.filter(function (s) { return !queryState.hiddenModels[s.name]; });
    return filteredSeries;
  }

  function formatYLabel(val) {
    val = Number(val);
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return String(Math.round(val));
  }

  // ========== 柱形图渲染（OpenCode 风格）==========
  function renderChart() {
    var canvas = document.getElementById('tqChartCanvas');
    if (!canvas) return;
    var chart = queryState.chartData;
    if (!chart || !chart.dates.length) return;

    var filteredSeries = getFilteredSeries();
    var max = getStackedMax(filteredSeries);
    if (max === 0) max = 1;

    var ticks = getNiceTicks(max);
    var tickMax = ticks[ticks.length - 1];
    var dpr = window.devicePixelRatio || 1;
    var pad = { top: 20, right: 16, bottom: 36, left: 0 };
    var ph = CHART_HEIGHT - pad.top - pad.bottom;
    var n = chart.dates.length;
    var leftPad = 16;
    var totalW = leftPad + n * (BAR_WIDTH + BAR_GAP) + BAR_GAP;
    var w = Math.max(totalW, 200);
    var h = CHART_HEIGHT;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // 网格线
    ticks.forEach(function (tickVal) {
      var ratio = tickVal / tickMax;
      if (ratio <= 0) return;
      var y = pad.top + ph - ratio * ph;
      ctx.strokeStyle = 'rgba(148,163,184,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    // X 轴底边线
    ctx.strokeStyle = 'rgba(148,163,184,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, pad.top + ph);
    ctx.lineTo(w, pad.top + ph);
    ctx.stroke();

    // 绘制柱形（堆叠 + 渐变平顶）
    var stacks = {};
    var segmentBounds = [];
    filteredSeries.forEach(function (s, si) {
      s.data.forEach(function (val, di) {
        if (val <= 0) return;
        if (!stacks[di]) stacks[di] = 0;
        var x = leftPad + BAR_GAP + di * (BAR_WIDTH + BAR_GAP);
        var bh = (val / tickMax) * ph;
        var y = pad.top + ph - stacks[di] - bh;
        if (bh <= 0) return;

        // 渐变填充
        var grad = ctx.createLinearGradient(x, y, x, y + bh);
        grad.addColorStop(0, lightenColor(s.color, 30));
        grad.addColorStop(1, s.color);
        ctx.fillStyle = grad;
        ctx.fillRect(Math.round(x), Math.round(y), BAR_WIDTH, Math.round(bh));

        // 记录分段位置用于点击检测
        segmentBounds.push({
          dayIndex: di,
          modelName: s.name,
          value: val,
          x: x, y: y, w: BAR_WIDTH, h: bh
        });

        stacks[di] += bh;
      });
    });
    renderChart._segments = segmentBounds;

    // X 轴标签
    ctx.fillStyle = 'rgba(148,163,184,0.4)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // 日期标签：确保最小间距避免重叠
    var minGap = 60;
    var labelInterval = Math.max(1, Math.ceil(minGap / (BAR_WIDTH + BAR_GAP)));
    chart.dates.forEach(function (label, i) {
      if (i % labelInterval !== 0) return;
      var x = leftPad + BAR_GAP + i * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2;
      ctx.fillText(label, x, pad.top + ph + 8);
    });
  }

  // 点击柱形分段查看对应模型详情
  function setupChartClick() {
    var canvas = document.getElementById('tqChartCanvas');
    if (!canvas) return;
    canvas.onclick = function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var chart = queryState.chartData;
      if (!chart || !chart.dates.length) return;
      var di = Math.round((mx - leftPad - BAR_GAP) / (BAR_WIDTH + BAR_GAP));
      if (di < 0 || di >= chart.dates.length) return;

      // 渲染过程中保存的分段位置信息
      var segments = renderChart._segments || [];
      var hit = null;
      for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        if (seg.dayIndex === di && mx >= seg.x && mx <= seg.x + seg.w && my >= seg.y && my <= seg.y + seg.h) {
          hit = seg;
          break;
        }
      }

      if (hit) {
        var totalDay = 0;
        segments.forEach(function (s) { if (s.dayIndex === di) totalDay += s.value; });
        window.showToast(
          '📅 ' + chart.dates[di] + '\n' +
          hit.modelName + '\n' +
          fullTokenFormat(hit.value) + '\n' +
          '占比 ' + (totalDay > 0 ? (hit.value / totalDay * 100).toFixed(1) : 0) + '%',
          'info'
        );
      }
    };
  }

  function lightenColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = Math.min(255, (num >> 16) + percent);
    var g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
    var b = Math.min(255, (num & 0x0000FF) + percent);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function fullTokenFormat(val) {
    val = Number(val);
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M Tokens';
    if (val >= 1000) return (val / 1000).toFixed(2) + 'K Tokens';
    return val + ' Tokens';
  }

  // ========== 模型调用卡片列表 ==========
  function renderLogCards() {
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
    html += '<h3 class="tq-log-title">调用记录 <span class="tq-log-count">共 ' + total + ' 条 · 第' + page + '/' + totalPages + '页</span></h3>';
    html += '<div class="tq-log-actions">';
    html += '<button class="small-btn" id="tqCopyLogsBtn" type="button">复制</button>';
    html += '</div></div>';

    html += '<div class="tq-log-cards">';
    for (var j = 0; j < pageLogs.length; j++) {
      var log = pageLogs[j];
      var time = log.created_at ? timestampStr(log.created_at) : '—';
      var model = log.model_name || '—';
      var isComplete = (log.type === 0 || log.type === 2);
      var promptTokens = isComplete ? (log.prompt_tokens != null ? log.prompt_tokens : 0) : 0;
      var compTokens = isComplete ? (log.completion_tokens != null ? log.completion_tokens : 0) : 0;
      var totalTokens = Number(promptTokens) + Number(compTokens);

      html += '<div class="tq-log-entry">';
      html += '<div class="tq-log-entry-top">';
      html += '<div><div class="tq-log-model">' + escapeHtml(model) + '</div><div class="tq-log-time">' + time + '</div></div>';
      html += '<div><span class="tq-model-tag">' + (isComplete ? '完成' : '其他') + '</span></div>';
      html += '</div>';
      html += '<div class="tq-log-stats">';
      html += '<div class="tq-log-stat"><span class="tq-log-stat-label">输入</span><span class="tq-log-stat-value">' + promptTokens + '</span></div>';
      html += '<div class="tq-log-stat"><span class="tq-log-stat-label">输出</span><span class="tq-log-stat-value">' + compTokens + '</span></div>';
      html += '<div class="tq-log-stat tq-log-stat-total"><span class="tq-log-stat-label">合计 Token</span><span class="tq-log-stat-value">' + totalTokens + '</span></div>';
      if (isComplete && log.quota) {
        html += '<div class="tq-log-stat"><span class="tq-log-stat-label">花费</span><span class="tq-log-stat-value">' + formatQuota(log.quota) + '</span></div>';
      }
      if (log.use_time != null) {
        html += '<div class="tq-log-stat"><span class="tq-log-stat-label">耗时</span><span class="tq-log-stat-value">' + log.use_time + 's</span></div>';
      }
      html += '</div></div>';
    }
    html += '</div>';

    // 分页
    if (totalPages > 1) {
      html += '<div class="tq-pagination">';
      html += '<button class="small-btn" id="tqPrevPageBtn" type="button"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>';
      html += '<span class="tq-page-info">' + page + '/' + totalPages + '</span>';
      html += '<button class="small-btn" id="tqNextPageBtn" type="button"' + (page >= totalPages ? ' disabled' : '') + '>下一页</button>';
      html += '</div>';
    }

    logSection.innerHTML = html;

    // 复制按钮
    var copyBtn = document.getElementById('tqCopyLogsBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var txt = '时间\t模型\t输入Tokens\t输出Tokens\t合计Tokens\n';
        for (var k = 0; k < logs.length; k++) {
          var l = logs[k];
          var t = timestampStr(l.created_at);
          var pt = (l.type === 0 || l.type === 2) ? (l.prompt_tokens || 0) : 0;
          var ct = (l.type === 0 || l.type === 2) ? (l.completion_tokens || 0) : 0;
          txt += t + '\t' + (l.model_name || '—') + '\t' + pt + '\t' + ct + '\t' + (Number(pt) + Number(ct)) + '\n';
        }
        if (typeof window.copyText === 'function') {
          window.copyText(txt, '调用记录已复制');
        }
      });
    }

    // 翻页
    var prevBtn = document.getElementById('tqPrevPageBtn');
    var nextBtn = document.getElementById('tqNextPageBtn');
    if (prevBtn) prevBtn.addEventListener('click', function () { if (queryState.currentPage > 1) { queryState.currentPage--; renderLogCards(); } });
    if (nextBtn) nextBtn.addEventListener('click', function () { if (queryState.currentPage < totalPages) { queryState.currentPage++; renderLogCards(); } });
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

  function buildFilter() {
    var sel = document.getElementById('tqModelFilter');
    if (!sel || !queryState.chartData) return;
    sel.innerHTML = '<option value="">全部模型</option>';
    queryState.chartData.series.forEach(function (s) {
      sel.innerHTML += '<option value="' + escapeHtml(s.name) + '">' + escapeHtml(s.name) + '</option>';
    });
    sel.onchange = function () { renderYAxis(); renderChart(); };
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
      setupChartClick();
    }).catch(function (err) {
      queryState.loading = false;
      queryState.result = null;
      queryState.logs = [];
      els.resultArea.innerHTML =
        '<div class="tq-error">' +
          '<div class="tq-error-icon">⚠️</div>' +
          '<div class="tq-error-text">' + escapeHtml(err.message || String(err)) + '</div>' +
          '<p class="tq-error-hint">请检查 NewAPI 端点和认证令牌是否正确，确保中转站已开启。</p>' +
        '</div>';
    });
  }

  function formatQuota(quota) {
    if (quota == null) return '—';
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
      savedEndpoints: document.getElementById('tqSavedEndpoints'),
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

  var escapeHtml = window.escapeHtml;
  var normalizeBaseUrl = window.normalizeBaseUrl;

  // ========== 初始化与事件绑定 ==========

  function populateChannelSelect() {
    var sel = getTqEls().channelSelect;
    var channels = (typeof AppState !== 'undefined' && AppState.channels) || [];
    var groups = {};
    channels.forEach(function (ch) {
      var g = ch.group || 'default';
      if (!groups[g]) groups[g] = [];
      groups[g].push(ch);
    });
    var html = '<option value="" data-key="">-- 手动输入 --</option>';
    var groupNames = Object.keys(groups).sort();
    groupNames.forEach(function (g) {
      html += '<optgroup label="' + escapeHtml(g) + '">';
      groups[g].forEach(function (ch) {
        var url = (ch.base_url || '').replace(/\/v[1-4]\/?$/i, '');
        var name = escapeHtml(ch.name || '');
        var keys = ch.keys || [];
        if (keys.length) {
          keys.forEach(function (k, ki) {
            var keyVal = escapeHtml(k.value || '');
            var keyLabel = escapeHtml(k.label || 'Key ' + (ki + 1));
            html += '<option value="' + escapeHtml(url) + '" data-key="' + keyVal + '">' + name + ' / ' + keyLabel + '</option>';
          });
        } else {
          html += '<option value="' + escapeHtml(url) + '" data-key="">' + name + ' / 无 Key</option>';
        }
      });
      html += '</optgroup>';
    });
    sel.innerHTML = html;
  }

  function initTokenQuery() {
    var els = getTqEls();
    if (!els.modal) return;

    // 渠道选择 - 自动填入
    els.channelSelect.addEventListener('change', function () {
      var opt = els.channelSelect.options[els.channelSelect.selectedIndex];
      if (opt && opt.value) {
        els.serverUrlInput.value = opt.value;
        var key = opt.getAttribute('data-key') || '';
        if (key) els.apiKeyInput.value = key;
      }
    });

    // 已保存端点选择 - 自动填入
    if (els.savedEndpoints) {
      els.savedEndpoints.addEventListener('change', function () {
        var opt = els.savedEndpoints.options[els.savedEndpoints.selectedIndex];
        if (opt && opt.value) {
          els.serverUrlInput.value = opt.value;
          var key = opt.getAttribute('data-key') || '';
          if (key) els.apiKeyInput.value = key;
        }
      });
    }

    els.queryBtn.addEventListener('click', doQuery);

    els.apiKeyInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doQuery();
    });
    els.serverUrlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doQuery();
    });

    els.closeBtn.addEventListener('click', function () { closeModal(); });
    els.closeFooterBtn.addEventListener('click', function () { closeModal(); });

    // 保存端点（支持命名）
    if (els.saveUrlBtn) {
      els.saveUrlBtn.addEventListener('click', function () {
        var url = els.serverUrlInput.value.trim();
        var key = els.apiKeyInput.value.trim();
        if (!url) { window.showToast('请输入端点的服务地址', 'warning'); return; }
        var label = prompt('为此端点命名（可选）：', url.replace(/^https?:\/\//i, '').split('/')[0]);
        if (label === null) return;
        addEndpoint(url, key, label || url);
        populateSavedEndpoints();
        window.showToast('端点已保存', 'success');
      });
    }

    // 删除已保存端点
    var deleteBtn = document.getElementById('tqDeleteEndpointBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        var sel = els.savedEndpoints;
        if (!sel || !sel.value) { window.showToast('请先选择一个端点', 'warning'); return; }
        if (!confirm('确定删除端点「' + sel.options[sel.selectedIndex].text + '」？')) return;
        removeEndpoint(sel.value);
        populateSavedEndpoints();
        els.serverUrlInput.value = '';
        els.apiKeyInput.value = '';
        window.showToast('端点已删除', 'success');
      });
    }

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
      window.showToast('请输入服务端点地址', 'warning');
      els.serverUrlInput.focus();
      return;
    }
    if (!apiKey) {
      window.showToast('请输入认证令牌', 'warning');
      els.apiKeyInput.focus();
      return;
    }

    renderTokenQueryModal(baseUrl, apiKey);
  }

  function openTokenQueryModal() {
    var els = getTqEls();
    // 从已保存端点加载上次使用的
    var list = loadEndpoints();
    if (list.length) {
      var last = list[list.length - 1];
      els.serverUrlInput.value = last.url || '';
      els.apiKeyInput.value = last.apiKey || '';
    } else {
      els.serverUrlInput.value = '';
      els.apiKeyInput.value = '';
    }
    queryState.currentPage = 1;
    populateChannelSelect();
    populateSavedEndpoints();
    els.modal.classList.add('active');
    els.resultArea.innerHTML = '<div class="tq-placeholder">查询 NewAPI 中转站用量数据。从下方渠道或已保存端点选择自动填入，或手动输入后点击「查询」查看用量统计与图表。</div>';
  }

  function closeModal() {
    var els = getTqEls();
    if (els.modal) els.modal.classList.remove('active');
    // 不主动清空输入，保留已填入内容
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
