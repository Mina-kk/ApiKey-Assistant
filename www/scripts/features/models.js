function clearAllModels() {
  if (!AppState.channels.length) { showToast("暂无渠道", "warning"); return; }
  if (!confirm("确定清空所有渠道中的模型列表？")) return;
  AppState.channels.forEach(function (ch) { ch.models = []; ch.updated_time = Date.now(); });
  AppState.expandedModels = {};
  saveChannels();
  renderAll();
  showToast("已清空所有模型", "success");
}


function confirmBatchModelFetch(count) {
  return confirm("准备批量获取 " + count + " 个渠道的模型。\n\n提醒：批量获取模型时请尽量关闭代理/VPN，挂着代理可能导致部分渠道获取不到模型结果。\n\n已为批量获取启用并发和单渠道超时，慢渠道不会阻塞其它渠道。是否继续？");
}

function buildFetchModelsTasks(channels) {
  var timeoutMs = getBatchModelFetchTimeoutMs();
  return channels.map(function (ch) {
    return function () {
      if (!getChannelFirstKey(ch)) return Promise.reject(new Error("无 Key"));
      var oldCount = ch.models ? ch.models.length : 0;
      return fetchUpstreamModels(ch, { timeoutMs: timeoutMs }).then(function (models) {
        ch.models = uniqueArray((ch.models || []).concat(models));
        ch.updated_time = Date.now();
        return Math.max(0, ch.models.length - oldCount);
      });
    };
  });
}

function summarizeBatchModelResults(results) {
  var success = results.filter(function (r) { return r && r.status === "fulfilled"; }).length;
  var fail = results.length - success;
  var totalAdded = results.reduce(function (sum, r) { return sum + (r && r.status === "fulfilled" ? r.value : 0); }, 0);
  var failSamples = results.map(function (r, i) {
    if (!r || r.status !== "rejected") return "";
    var msg = r.reason && r.reason.message ? r.reason.message : String(r.reason || "失败");
    return "#" + (i + 1) + " " + msg;
  }).filter(Boolean).slice(0, 3);
  var text = "成功 " + success + " 失败 " + fail + " 新增 " + totalAdded + " 模型";
  if (failSamples.length) text += "；失败示例：" + failSamples.join("；");
  return { success: success, fail: fail, totalAdded: totalAdded, text: text };
}

function fetchAllModels() {
  if (!AppState.channels.length) { showToast("暂无渠道", "warning"); return; }
  if (!confirmBatchModelFetch(AppState.channels.length)) return;
  var concurrency = Math.max(1, Number(AppState.settings.concurrency) || 6);
  var timeoutSec = Math.round(getBatchModelFetchTimeoutMs() / 1000);
  showToast("开始并发获取模型：并发 " + concurrency + "，单渠道超时 " + timeoutSec + " 秒", "info");
  var tasks = buildFetchModelsTasks(AppState.channels);
  runWithConcurrency(tasks, concurrency, function (result, index, finished, total) {
    if (finished === total || finished % 3 === 0) showToast("批量获取进度 " + finished + "/" + total, "info");
  }).then(function (results) {
    saveChannels();
    renderAll();
    var summary = summarizeBatchModelResults(results);
    showToast(summary.text, summary.totalAdded > 0 ? "success" : "warning");
  });
}

// 批量操作
