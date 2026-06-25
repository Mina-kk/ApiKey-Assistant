function getSelectedIds() {
  return Object.keys(AppState.selectedChannels).filter(function (id) {
    return AppState.selectedChannels[id];
  });
}

function enableBatchMode() {
  AppState.batchMode = true;
  AppState.selectedChannels = {};
  AppState.els.batchBar.classList.add("active");
  AppState.els.addBtn.style.display = "none";
  populateBatchGroupSelect();
  updateBatchBar();
  renderCards();
}

function disableBatchMode() {
  AppState.batchMode = false;
  AppState.selectedChannels = {};
  AppState.els.batchBar.classList.remove("active");
  AppState.els.addBtn.style.display = "";
  renderCards();
}

function updateBatchBar() {
  var filtered = getFilteredChannels();
  var selectedCount = filtered.filter(function (ch) { return AppState.selectedChannels[ch.id]; }).length;
  AppState.els.batchCount.textContent = "已选 " + selectedCount + " 项";
  AppState.els.batchSelectAll.checked = filtered.length > 0 && selectedCount === filtered.length;
}

function batchSetStatus(status) {
  var ids = getSelectedIds();
  if (!ids.length) { showToast("未选择任何渠道", "warning"); return; }
  AppState.channels.forEach(function (ch) { if (ids.indexOf(ch.id) !== -1) ch.status = status; });
  saveChannels();
  renderCards();
  showToast(status === 1 ? "已启用" : "已禁用", "success");
}

function batchMoveToGroup() {
  var ids = getSelectedIds();
  if (!ids.length) { showToast("未选择任何渠道", "warning"); return; }
  var group = AppState.els.batchGroupSelect.value || "default";
  ensureGroupExists(group);
  AppState.channels.forEach(function (ch) {
    if (ids.indexOf(ch.id) !== -1) {
      ch.group = group;
      ch.updated_time = Date.now();
    }
  });
  saveChannels();
  renderAll();
  updateBatchBar();
  showToast("已移动到 " + group, "success");
}

function batchDelete() {
  var ids = getSelectedIds();
  if (!ids.length) { showToast("未选择任何渠道", "warning"); return; }
  if (!confirm("确定删除所选 " + ids.length + " 个渠道？")) return;
  AppState.channels = AppState.channels.filter(function (ch) { return ids.indexOf(ch.id) === -1; });
  ids.forEach(function (id) { delete AppState.expandedModels[id]; delete AppState.selectedChannels[id]; });
  saveChannels();
  renderAll();
  showToast("已删除 " + ids.length + " 个渠道", "success");
}

function batchFetchModels() {
  var ids = getSelectedIds();
  if (!ids.length) { showToast("未选择任何渠道", "warning"); return; }
  var selectedChannels = AppState.channels.filter(function (ch) { return ids.indexOf(ch.id) !== -1; });
  if (!confirmBatchModelFetch(selectedChannels.length)) return;
  var concurrency = Math.max(1, Number(AppState.settings.concurrency) || 6);
  var timeoutSec = Math.round(getBatchModelFetchTimeoutMs() / 1000);
  showToast("开始并发获取模型：并发 " + concurrency + "，单渠道超时 " + timeoutSec + " 秒", "info");
  var tasks = buildFetchModelsTasks(selectedChannels);
  runWithConcurrency(tasks, concurrency, function (result, index, finished, total) {
    if (finished === total || finished % 3 === 0) showToast("批量获取进度 " + finished + "/" + total, "info");
  }).then(function (results) {
    saveChannels();
    renderAll();
    updateBatchBar();
    var summary = summarizeBatchModelResults(results);
    showToast(summary.text, summary.totalAdded > 0 ? "success" : "warning");
  });
}

