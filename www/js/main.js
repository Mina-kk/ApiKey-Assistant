// 应用入口与事件绑定层

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  cacheElements();
  loadSettings();
  AppState.channels = loadChannels();
  AppState.groups = loadGroups();
  populateTypeSelect();
  applyTheme();
  bindEvents();
  if (typeof initNewApiEvents === "function") initNewApiEvents();
  renderAll();
  startProxyMonitor();
  if (typeof addLog === "function") addLog("info", "app initialized", { androidBridge: !!window.AndroidBridge, userAgent: navigator.userAgent });
}

function bindEvents() {
  var els = AppState.els;

  // 应用栏
  els.menuBtn.addEventListener("click", openDrawer);
  els.closeDrawerBtn.addEventListener("click", closeDrawer);
  els.drawerMask.addEventListener("click", closeDrawer);
  els.searchToggleBtn.addEventListener("click", toggleSearchPanel);
  els.themeBtn.addEventListener("click", toggleTheme);
  els.moreBtn.addEventListener("click", toggleMoreMenu);
  els.clearSearchBtn.addEventListener("click", function () {
    els.searchInput.value = "";
    renderCards();
  });

  // 搜索
  els.searchInput.addEventListener("input", function () {
    renderCards();
  });

  // 分组
  els.groupList.addEventListener("click", function (e) {
    var item = e.target.closest(".group-item");
    if (!item) return;
    AppState.currentGroup = item.dataset.group;
    els.appBarSubtitle.textContent = AppState.currentGroup ? item.querySelector("span").textContent : "全部渠道";
    closeDrawer();
    renderAll();
  });
  els.manageGroupsBtn.addEventListener("click", function () {
    closeDrawer();
    renderGroupManageList();
    openModal(els.groupModal);
  });

  // 更多菜单
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#moreBtn") && !e.target.closest("#moreMenu")) {
      els.moreMenu.classList.remove("active");
    }
  });
  els.menuImportBtn.addEventListener("click", function () { els.moreMenu.classList.remove("active"); openModal(els.importModal); });
  els.menuExportBtn.addEventListener("click", function () { els.moreMenu.classList.remove("active"); openModal(els.exportModal); });
  els.menuSettingsBtn.addEventListener("click", function () { els.moreMenu.classList.remove("active"); openSettingsModal(); });
  els.menuSortBtn.addEventListener("click", function () { els.moreMenu.classList.remove("active"); openModal(els.sortModal); });
  els.menuBatchBtn.addEventListener("click", function () { els.moreMenu.classList.remove("active"); enableBatchMode(); });
  els.menuClearAllModelsBtn.addEventListener("click", function () { els.moreMenu.classList.remove("active"); clearAllModels(); });
  els.menuFetchAllModelsBtn.addEventListener("click", function () { els.moreMenu.classList.remove("active"); fetchAllModels(); });
  els.menuTestBtn.addEventListener("click", function () { els.moreMenu.classList.remove("active"); openTestModal(); });
  if (els.menuLogBtn) els.menuLogBtn.addEventListener("click", function () { els.moreMenu.classList.remove("active"); openLogModal(); });

  // FAB
  els.addBtn.addEventListener("click", openAddEditor);
  els.addBtn.addEventListener("touchend", function (e) {
    e.preventDefault();
    e.stopPropagation();
    openAddEditor();
  });

  // 编辑器
  els.typeInput.addEventListener("change", function () {
    var type = Number(els.typeInput.value);
    var base = ChannelBaseURLs[type] || "";
    if (base) els.baseUrlInput.value = base;
  });
  els.copyBaseInEditorBtn.addEventListener("click", function () { copyText(els.baseUrlInput.value.trim(), "Base URL 已复制"); });
  els.addKeyBtn.addEventListener("click", function () {
    var count = els.keyRows.querySelectorAll(".key-row").length;
    addKeyRow("Key " + (count + 1), "");
  });
  els.modelInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); addModelFromEditor(); }
  });
  els.addModelBtn.addEventListener("click", addModelFromEditor);
  els.clearEditModelsBtn.addEventListener("click", function () {
    if (!AppState.editModels.length) return;
    if (!confirm("确定清空模型列表？")) return;
    AppState.editModels = [];
    renderEditModels();
  });
  els.editModelMappingBtn.addEventListener("click", openModelMappingEditor);
  els.fetchModelsInEditorBtn.addEventListener("click", fetchModelsInEditor);
  els.saveChannelBtn.addEventListener("click", saveEditorChannel);
  els.cancelEditorBtn.addEventListener("click", function () { closeModal(els.editorModal); });
  els.closeEditorBtn.addEventListener("click", function () { closeModal(els.editorModal); });

  // 模型映射弹窗
  els.addMappingBtn.addEventListener("click", function () {
    AppState.editMappings.push({ from: "", to: "" });
    renderMappingList();
  });
  els.saveModelMappingBtn.addEventListener("click", saveModelMapping);
  els.cancelModelMappingBtn.addEventListener("click", function () { closeModal(els.modelMappingModal); });
  els.closeModelMappingBtn.addEventListener("click", function () { closeModal(els.modelMappingModal); });

  // 测试弹窗
  els.closeTestBtn.addEventListener("click", function () { closeModal(els.testModal); });
  els.closeTestFooterBtn.addEventListener("click", function () { closeModal(els.testModal); });
  els.testKeySelect.addEventListener("change", updateTestModelSelect);
  els.startTestBtn.addEventListener("click", runChatTest);

  // 导入导出
  els.closeImportBtn.addEventListener("click", function () { closeModal(els.importModal); });
  els.cancelImportBtn.addEventListener("click", function () { closeModal(els.importModal); });
  els.confirmImportBtn.addEventListener("click", importChannels);
  els.readClipboardBtn.addEventListener("click", readClipboardImport);
  els.closeExportBtn.addEventListener("click", function () { closeModal(els.exportModal); });
  els.exportCopyBtn.addEventListener("click", exportChannelsCopy);

  // 设置
  els.closeSettingsBtn.addEventListener("click", function () { closeModal(els.settingsModal); });
  document.querySelectorAll(".segment[data-theme]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      AppState.settings.theme = btn.dataset.theme;
      saveSettings();
      applyTheme();
      updateThemeSegments();
    });
  });
  els.timeoutInput.addEventListener("change", function () {
    AppState.settings.timeout = Number(els.timeoutInput.value) || 60;
    saveSettings();
  });
  els.concurrencyInput.addEventListener("change", function () {
    AppState.settings.concurrency = Number(els.concurrencyInput.value) || 4;
    saveSettings();
  });
  els.defaultPromptInput.addEventListener("change", function () {
    AppState.settings.defaultPrompt = els.defaultPromptInput.value;
    saveSettings();
  });
  els.clearAllDataBtn.addEventListener("click", clearAllData);

  // 分组管理
  els.closeGroupBtn.addEventListener("click", function () { closeModal(els.groupModal); });
  els.addGroupBtn.addEventListener("click", addNewGroup);
  els.newGroupInput.addEventListener("keydown", function (e) { if (e.key === "Enter") addNewGroup(); });
  els.groupManageList.addEventListener("click", handleGroupManageAction);

  // 排序
  els.closeSortBtn.addEventListener("click", function () { closeModal(els.sortModal); });
  if (els.closeLogBtn) els.closeLogBtn.addEventListener("click", function () { closeModal(els.logModal); });
  if (els.copyLogBtn) els.copyLogBtn.addEventListener("click", copyLogs);
  if (els.clearLogBtn) els.clearLogBtn.addEventListener("click", clearLogs);
  document.querySelectorAll(".sort-option").forEach(function (btn) {
    btn.addEventListener("click", function () {
      AppState.sortBy = btn.dataset.sort;
      AppState.sortOrder = btn.dataset.order;
      closeModal(els.sortModal);
      renderAll();
    });
  });

  // 卡片操作
  els.cardsContainer.addEventListener("click", handleCardAction);

  // 批量操作
  els.batchSelectAll.addEventListener("change", function () {
    var checked = els.batchSelectAll.checked;
    var filtered = getFilteredChannels();
    filtered.forEach(function (ch) { AppState.selectedChannels[ch.id] = checked; });
    updateBatchBar();
    renderCards();
  });
  els.batchMoveGroupBtn.addEventListener("click", batchMoveToGroup);
  els.batchEnableBtn.addEventListener("click", function () { batchSetStatus(1); });
  els.batchDisableBtn.addEventListener("click", function () { batchSetStatus(0); });
  els.batchFetchModelsBtn.addEventListener("click", batchFetchModels);
  els.batchDeleteBtn.addEventListener("click", batchDelete);
  els.batchCancelBtn.addEventListener("click", disableBatchMode);

  // 弹窗外点击关闭
  [els.editorModal, els.modelMappingModal, els.testModal, els.importModal, els.exportModal, els.settingsModal, els.groupModal, els.sortModal, els.newApiModal].forEach(function (modal) {
    if (!modal) return;
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(modal); });
  });

  // ESC 关闭
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeAllModals();
      closeDrawer();
      els.moreMenu.classList.remove("active");
      if (AppState.batchMode) disableBatchMode();
    }
  });
}

function openDrawer() {
  AppState.groups = loadGroups();
  renderDrawerGroups();
  AppState.els.drawer.classList.add("active");
  AppState.els.drawerMask.classList.add("active");
}

function closeDrawer() {
  AppState.els.drawer.classList.remove("active");
  AppState.els.drawerMask.classList.remove("active");
}

function toggleSearchPanel() {
  AppState.els.searchPanel.classList.toggle("active");
  if (AppState.els.searchPanel.classList.contains("active")) {
    AppState.els.searchInput.focus();
  }
}

function toggleMoreMenu() {
  AppState.els.moreMenu.classList.toggle("active");
}

function toggleTheme() {
  var themes = ["dark", "light", "auto"];
  var idx = themes.indexOf(AppState.settings.theme);
  AppState.settings.theme = themes[(idx + 1) % themes.length];
  saveSettings();
  applyTheme();
  updateThemeSegments();
}

function applyTheme() {
  var theme = AppState.settings.theme;
  var isLight = theme === "light";
  if (theme === "auto") {
    isLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  }
  document.body.classList.toggle("light", isLight);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isLight ? "#f8fafc" : "#070812");
}

function updateThemeSegments() {
  document.querySelectorAll(".segment[data-theme]").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.theme === AppState.settings.theme);
  });
}

function openSettingsModal() {
  AppState.els.timeoutInput.value = AppState.settings.timeout;
  AppState.els.concurrencyInput.value = AppState.settings.concurrency;
  AppState.els.defaultPromptInput.value = AppState.settings.defaultPrompt;
  if (AppState.els.newApiEnabledInput) AppState.els.newApiEnabledInput.checked = !!AppState.settings.newApiEnabled;
  updateThemeSegments();
  openModal(AppState.els.settingsModal);
}

function openModelMappingEditor() {
  renderMappingList();
  openModal(AppState.els.modelMappingModal);
}

function saveModelMapping() {
  var rows = AppState.els.mappingList.querySelectorAll(".mapping-row");
  var mapping = {};
  rows.forEach(function (row) {
    var from = row.querySelector(".mapping-from").value.trim();
    var to = row.querySelector(".mapping-to").value.trim();
    if (from && to) mapping[from] = to;
  });
  AppState.editMappings = modelMappingToArray(mapping);
  closeModal(AppState.els.modelMappingModal);
}

function addModelFromEditor() {
  var input = AppState.els.modelInput;
  var value = input.value.trim();
  if (!value) return;
  if (AppState.editModels.indexOf(value) !== -1) { showToast("模型已存在", "warning"); return; }
  AppState.editModels = uniqueArray(AppState.editModels.concat([value]));
  input.value = "";
  renderEditModels();
}

function collectEditorKeys() {
  var rows = Array.prototype.slice.call(AppState.els.keyRows.querySelectorAll(".key-row"));
  return rows.map(function (row, index) {
    return {
      id: row.dataset.keyId || createId(),
      label: row.querySelector(".key-label-input").value.trim() || ("Key " + (index + 1)),
      value: row.querySelector(".key-value-input").value.trim()
    };
  }).filter(function (k) { return !!k.value; });
}

function buildChannelFromEditor() {
  var els = AppState.els;
  var id = els.editingId.value || createId();
  var name = els.nameInput.value.trim();
  var channelType = Number(els.typeInput.value);
  var baseUrl = normalizeBaseUrl(els.baseUrlInput.value.trim());
  var group = els.groupInput.value || "default";
  var keys = collectEditorKeys();

  if (!name) { showToast("请输入名称", "error"); return null; }
  if (!baseUrl) { showToast("请输入 Base URL", "error"); return null; }
  if (!keys.length) { showToast("请至少填写一个 API Key", "error"); return null; }

  var mapping = {};
  AppState.editMappings.forEach(function (m) { if (m.from && m.to) mapping[m.from] = m.to; });

  var old = AppState.channels.find(function (c) { return c.id === id; });
  var now = Date.now();
  var rawKeys = keys.map(function (k) { return k.value; });

  return {
    id: id,
    type: channelType,
    name: name,
    key: rawKeys.join("\n"),
    keys: keys,
    base_url: baseUrl,
    models: uniqueArray(AppState.editModels),
    model_mapping: Object.keys(mapping).length ? safeJsonStringify(mapping) : null,
    group: group,
    status: els.statusInput.checked ? 1 : 0,
    weight: Number(els.weightInput.value) || 0,
    priority: Number(els.priorityInput.value) || 0,
    auto_ban: els.autoBanInput.checked ? 1 : 0,
    response_time: old ? old.response_time : 0,
    test_time: old ? old.test_time : 0,
    test_model: els.testModelInput.value.trim() || null,
    balance: old ? old.balance : 0,
    balance_updated_time: old ? old.balance_updated_time : 0,
    used_quota: old ? old.used_quota : 0,
    tag: els.tagInput.value.trim() || null,
    remark: els.remarkInput.value.trim() || null,
    other_settings: els.otherSettingsInput.value.trim() || "",
    param_override: els.paramOverrideInput.value.trim() || null,
    header_override: els.headerOverrideInput.value.trim() || null,
    openai_organization: old ? old.openai_organization : null,
    channel_info: {
      is_multi_key: rawKeys.length > 1,
      multi_key_mode: els.multiKeyModeInput.value !== "" ? Number(els.multiKeyModeInput.value) : MultiKeyMode.Single,
      multi_key_polling_index: old && old.channel_info ? old.channel_info.multi_key_polling_index || 0 : 0
    },
    created_time: old ? old.created_time : now,
    updated_time: now
  };
}

function saveEditorChannel() {
  var channel = buildChannelFromEditor();
  if (!channel) return;
  ensureGroupExists(channel.group);
  var old = AppState.channels.find(function (c) { return c.id === channel.id; });
  if (old) {
    AppState.channels = AppState.channels.map(function (c) { return c.id === channel.id ? channel : c; });
  } else {
    AppState.channels.unshift(channel);
  }
  saveChannels();
  closeModal(AppState.els.editorModal);
  renderAll();
  showToast(old ? "已更新" : "已新增", "success");
}

function fetchModelsInEditor() {
  var els = AppState.els;
  var channelType = Number(els.typeInput.value);
  var baseUrl = normalizeBaseUrl(els.baseUrlInput.value.trim());
  var keys = collectEditorKeys();
  var firstKey = keys.length ? keys[0].value : "";
  if (!baseUrl || !firstKey) { setStatus(els.editorStatus, "请先填写 Base URL 和 Key", "error"); return; }

  var tempChannel = normalizeChannel({ type: channelType, base_url: baseUrl, key: firstKey });
  setStatus(els.editorStatus, "正在获取模型...");
  fetchUpstreamModels(tempChannel).then(function (models) {
    AppState.editModels = uniqueArray(AppState.editModels.concat(models));
    renderEditModels();
    setStatus(els.editorStatus, "获取成功：" + models.length + " 个模型", "success");
    showToast("模型获取成功", "success");
  }).catch(function (err) {
    setStatus(els.editorStatus, err.message, "error");
    showToast(err.message, "error");
  });
}

function handleCardAction(e) {
  var target = e.target.closest("[data-action]");
  if (!target) return;
  var card = target.closest(".api-card");
  var id = card ? card.dataset.id : "";
  var action = target.dataset.action;
  var ch = AppState.channels.find(function (c) { return c.id === id; });
  if (!ch && action !== "select-card") return;

  if (AppState.batchMode && action !== "select-card") { showToast("请先退出批量模式", "warning"); return; }

  if (action === "select-card") {
    AppState.selectedChannels[id] = target.checked;
    updateBatchBar();
    renderCards();
    return;
  }

  if (action === "edit") { openEditEditor(ch); return; }

  if (action === "delete") {
    if (!confirm("确定删除「" + ch.name + "」吗？")) return;
    AppState.channels = AppState.channels.filter(function (c) { return c.id !== id; });
    delete AppState.expandedModels[id];
    delete AppState.selectedChannels[id];
    saveChannels();
    renderAll();
    return;
  }

  if (action === "copy-base") { copyText(ch.base_url, "Base URL 已复制"); return; }

  if (action === "copy-key") {
    var keyId = target.dataset.keyId;
    var key = (ch.keys || []).find(function (k) { return k.id === keyId; });
    if (key) copyText(key.value, "API Key 已复制");
    return;
  }

  if (action === "copy-all-keys") {
    var text = (ch.keys || []).map(function (k) { return (k.label || "Key") + ": " + k.value; }).join("\n");
    copyText(text, "全部 Key 已复制");
    return;
  }

  if (action === "copy-config") { copyText(safeJsonStringify(ch), "完整配置已复制"); return; }

  if (action === "copy-model") { copyText(target.dataset.model, "模型名已复制"); return; }

  if (action === "toggle-models") { AppState.expandedModels[id] = !AppState.expandedModels[id]; renderCards(); return; }

  if (action === "clear-models") {
    if (!confirm("确定清空模型列表？")) return;
    ch.models = [];
    ch.updated_time = Date.now();
    AppState.expandedModels[id] = false;
    saveChannels();
    renderAll();
    return;
  }

  if (action === "fetch-models-browser") { fetchModelsForCard(ch); return; }
}

function fetchModelsForCard(ch) {
  if (!getChannelFirstKey(ch)) { showToast("此渠道没有 API Key", "error"); return; }
  showToast("正在获取模型...", "info");
  fetchUpstreamModels(ch).then(function (models) {
    ch.models = uniqueArray((ch.models || []).concat(models));
    ch.updated_time = Date.now();
    saveChannels();
    renderAll();
    showToast("获取成功：" + models.length + " 个模型", "success");
  }).catch(function (err) { showToast(err.message, "error"); });
}

function openTestModal() {
  refreshTestSelects();
  AppState.els.testPromptInput.value = AppState.settings.defaultPrompt;
  AppState.els.testResultBox.textContent = "暂无结果";
  openModal(AppState.els.testModal);
}

function runChatTest() {
  var keyValue = AppState.els.testKeySelect.value;
  var model = AppState.els.testModelSelect.value;
  var prompt = AppState.els.testPromptInput.value.trim();
  if (!keyValue) { showToast("请选择 API Key", "error"); return; }

  var parts = keyValue.split("::");
  var channelId = parts[0];
  var keyId = parts[1];
  var ch = AppState.channels.find(function (c) { return c.id === channelId; });
  var key = (ch && ch.keys ? ch.keys : []).find(function (k) { return k.id === keyId; });
  if (!ch || !key) { showToast("API Key 不存在", "error"); return; }

  var testCh = JSON.parse(JSON.stringify(ch));
  testCh.keys = [key];
  testCh.key = key.value;

  AppState.els.testResultBox.textContent = "正在测试...";
  testChannel(testCh, model, prompt).then(function (reply) {
    AppState.els.testResultBox.textContent = reply;
    ch.response_time = testCh.response_time;
    ch.test_time = testCh.test_time;
    saveChannels();
  }).catch(function (err) {
    AppState.els.testResultBox.textContent = "测试失败：\n" + err.message;
  });
}

function importChannels() {
  try {
    var raw = AppState.els.importTextarea.value.trim();
    var data = JSON.parse(raw);
    var arr = Array.isArray(data) ? data : [data];
    var added = 0;
    arr.forEach(function (item) {
      AppState.channels.push(normalizeChannel(item));
      added++;
    });
    saveChannels();
    closeModal(AppState.els.importModal);
    renderAll();
    showToast("导入成功 " + added + " 条", "success");
  } catch (e) {
    showToast("JSON 格式错误：" + e.message, "error");
  }
}

function readClipboardImport() {
  readClipboardText(function (text) {
    if (text) {
      AppState.els.importTextarea.value = text;
      showToast("已读取剪贴板", "success");
    } else {
      showToast("剪贴板为空或无法读取", "warning");
    }
  });
}

function exportChannelsCopy() {
  closeModal(AppState.els.exportModal);
  copyText(safeJsonStringify(AppState.channels), "全部数据已复制");
}

function clearAllData() {
  if (!confirm("确定清除所有数据？此操作不可恢复！")) return;
  AppState.channels = [];
  AppState.groups = ["default"];
  saveChannels();
  saveGroups();
  closeModal(AppState.els.settingsModal);
  renderAll();
  showToast("已清除所有数据", "success");
}

function clearAllModels() {
  if (!AppState.channels.length) { showToast("暂无渠道", "warning"); return; }
  if (!confirm("确定清空所有渠道中的模型列表？")) return;
  AppState.channels.forEach(function (ch) { ch.models = []; ch.updated_time = Date.now(); });
  AppState.expandedModels = {};
  saveChannels();
  renderAll();
  showToast("已清空所有模型", "success");
}

function fetchAllModels() {
  if (!AppState.channels.length) { showToast("暂无渠道", "warning"); return; }
  showToast("开始批量获取模型...", "info");
  var tasks = AppState.channels.map(function (ch) {
    return function () {
      if (!getChannelFirstKey(ch)) return Promise.reject(new Error("无 Key"));
      return fetchUpstreamModels(ch).then(function (models) {
        ch.models = uniqueArray((ch.models || []).concat(models));
        ch.updated_time = Date.now();
        return models.length;
      });
    };
  });
  runWithConcurrency(tasks, AppState.settings.concurrency).then(function (results) {
    saveChannels();
    renderAll();
    var success = results.filter(function (r) { return r.status === "fulfilled"; }).length;
    var fail = results.length - success;
    var totalAdded = results.reduce(function (sum, r) { return sum + (r.status === "fulfilled" ? r.value : 0); }, 0);
    showToast("成功 " + success + " 失败 " + fail + " 新增 " + totalAdded + " 模型", totalAdded > 0 ? "success" : "warning");
  });
}

// 批量操作
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
  showToast("开始批量获取模型...", "info");
  var selectedChannels = AppState.channels.filter(function (ch) { return ids.indexOf(ch.id) !== -1; });
  var tasks = selectedChannels.map(function (ch) {
    return function () {
      if (!getChannelFirstKey(ch)) return Promise.reject(new Error("无 Key"));
      return fetchUpstreamModels(ch).then(function (models) {
        ch.models = uniqueArray((ch.models || []).concat(models));
        ch.updated_time = Date.now();
        return models.length;
      });
    };
  });
  runWithConcurrency(tasks, AppState.settings.concurrency).then(function (results) {
    saveChannels();
    renderAll();
    var success = results.filter(function (r) { return r.status === "fulfilled"; }).length;
    var fail = results.length - success;
    var totalAdded = results.reduce(function (sum, r) { return sum + (r.status === "fulfilled" ? r.value : 0); }, 0);
    showToast("成功 " + success + " 失败 " + fail + " 新增 " + totalAdded + " 模型", totalAdded > 0 ? "success" : "warning");
  });
}

function getSelectedIds() {
  return Object.keys(AppState.selectedChannels).filter(function (id) { return AppState.selectedChannels[id]; });
}

// 分组管理
function addNewGroup() {
  var input = AppState.els.newGroupInput;
  var name = input.value.trim();
  if (!name) { showToast("请输入分组名称", "warning"); return; }
  if (AppState.groups.indexOf(name) !== -1) { showToast("分组已存在", "warning"); return; }
  AppState.groups.push(name);
  AppState.groups.sort();
  saveGroups();
  input.value = "";
  renderGroupManageList();
  renderDrawerGroups();
  populateGroupSelect(name);
  populateBatchGroupSelect();
}

function handleGroupManageAction(e) {
  var btn = e.target.closest("button");
  if (!btn) return;
  var item = btn.closest(".group-manage-item");
  var group = item.dataset.group;

  if (btn.classList.contains("rename-group-btn")) {
    var newName = prompt("重命名分组：", group);
    if (newName && renameGroup(group, newName.trim())) {
      renderGroupManageList();
      renderDrawerGroups();
      populateGroupSelect(newName.trim());
      populateBatchGroupSelect();
      renderCards();
      showToast("已重命名", "success");
    }
  }

  if (btn.classList.contains("delete-group-btn")) {
    if (confirm("删除分组「" + group + "」？其下的渠道将移至 default")) {
      deleteGroup(group);
      renderGroupManageList();
      renderDrawerGroups();
      populateGroupSelect("default");
      populateBatchGroupSelect();
      renderCards();
      showToast("已删除", "success");
    }
  }
}

// 代理检测：定时刷新本地代理状态与延迟
function startProxyMonitor() {
  stopProxyMonitor();
  checkProxyLatency();
  AppState.proxy.timer = setInterval(checkProxyLatency, 3000);
}

function stopProxyMonitor() {
  if (AppState.proxy && AppState.proxy.timer) {
    clearInterval(AppState.proxy.timer);
    AppState.proxy.timer = null;
  }
}

function checkProxyLatency() {
  var proxyUrl = normalizeBaseUrl(AppState.settings.localProxyUrl || "http://127.0.0.1:9527");
  var start = Date.now();
  var targets = [
    proxyUrl + "/health",
    proxyUrl + "/ping",
    proxyUrl + "/"
  ];
  var index = 0;

  function tryNext() {
    if (index >= targets.length) {
      AppState.proxy.enabled = false;
      AppState.proxy.latency = null;
      AppState.proxy.lastChecked = Date.now();
      AppState.proxy.error = "未开启本地代理";
      renderProxyStatus();
      return;
    }
    var url = targets[index++];
    doHttpRequest("GET", url, {}, null, 1800).then(function () {
      AppState.proxy.enabled = true;
      AppState.proxy.latency = Date.now() - start;
      AppState.proxy.lastChecked = Date.now();
      AppState.proxy.error = "";
      if (typeof addLog === "function") addLog("debug", "proxy health ok", { url: url, latency: AppState.proxy.latency });
      renderProxyStatus();
    }).catch(function (e) {
      if (typeof addLog === "function") addLog("debug", "proxy health failed", { url: url, error: e.message || String(e) });
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
