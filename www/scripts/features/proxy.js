// 代理检测：定时刷新本地代理状态与延迟
function startProxyMonitor() {
  stopProxyMonitor();
  checkProxyLatency();
  AppState.proxy.timer = setInterval(checkProxyLatency, 12000);
  AppState.proxy._visibilityHandler = function () {
    if (document.hidden) stopProxyMonitor();
    else startProxyMonitor();
  };
  document.addEventListener("visibilitychange", AppState.proxy._visibilityHandler);
}

function stopProxyMonitor() {
  if (AppState.proxy && AppState.proxy.timer) {
    clearInterval(AppState.proxy.timer);
    AppState.proxy.timer = null;
  }
  if (AppState.proxy && AppState.proxy._visibilityHandler) {
    document.removeEventListener("visibilitychange", AppState.proxy._visibilityHandler);
    AppState.proxy._visibilityHandler = null;
  }
}

function checkProxyLatency() {
  var proxyUrl = normalizeBaseUrl(AppState.settings.localProxyUrl || "http://127.0.0.1:9527");
  var start = Date.now();
  var prevEnabled = AppState.proxy.enabled;
  var targets = [
    proxyUrl + "/health",
    proxyUrl + "/ping",
    proxyUrl + "/"
  ];
  var index = 0;

  function tryNext() {
    if (index >= targets.length) {
      var becameDisabled = prevEnabled;
      AppState.proxy.enabled = false;
      AppState.proxy.latency = null;
      AppState.proxy.lastChecked = Date.now();
      AppState.proxy.error = "未开启本地代理";
      if (becameDisabled && typeof addLog === "function") addLog("info", "proxy health failed", { error: AppState.proxy.error });
      renderProxyStatus();
      return;
    }
    var url = targets[index++];
    doHttpRequest("GET", url, {}, null, 1800).then(function () {
      var becameEnabled = !prevEnabled;
      AppState.proxy.enabled = true;
      AppState.proxy.latency = Date.now() - start;
      AppState.proxy.lastChecked = Date.now();
      AppState.proxy.error = "";
      if (becameEnabled && typeof addLog === "function") addLog("info", "proxy health ok", { url: url, latency: AppState.proxy.latency });
      renderProxyStatus();
    }).catch(function () {
      tryNext();
    });
  }

  tryNext();
}

function renderProxyStatus() {
  var bar = AppState.els.proxyStatusBar;
  var text = AppState.els.proxyStatusText;
  var latency = AppState.els.proxyLatencyText;
  if (!bar || !text || !latency) return;

  bar.classList.remove("ok", "error");
  if (AppState.proxy.enabled) {
    bar.classList.add("ok");
    var proxyUrl = normalizeBaseUrl(AppState.settings.localProxyUrl || "http://127.0.0.1:9527");
    text.innerHTML = '<span class="proxy-dot"></span><span class="proxy-title">本地代理已开启</span><span class="proxy-url">' + escapeHtml(proxyUrl.replace(/^https?:\/\//i, "")) + '</span>';
    latency.innerHTML = '<span class="proxy-latency-label">延迟</span><strong>' + escapeHtml(String(AppState.proxy.latency)) + 'ms</strong>';
  } else {
    bar.classList.add("error");
    var failedProxyUrl = normalizeBaseUrl(AppState.settings.localProxyUrl || "http://127.0.0.1:9527");
    text.innerHTML = '<span class="proxy-dot"></span><span class="proxy-title">本地代理未开启</span><span class="proxy-url">' + escapeHtml(failedProxyUrl.replace(/^https?:\/\//i, "")) + '</span>';
    latency.innerHTML = '<span class="proxy-latency-label">延迟</span><strong>--</strong>';

}
}
