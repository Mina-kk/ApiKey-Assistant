// NewAPI 模型命名工具

function updateNewApiEntryVisibility() {
  var btn = AppState.els.newApiEntryBtn;
  if (!btn) return;
  btn.style.display = AppState.settings.newApiEnabled ? "grid" : "none";
}

function initNewApiEvents() {
  var els = AppState.els;
  updateNewApiEntryVisibility();
  if (els.newApiEntryBtn) els.newApiEntryBtn.addEventListener("click", toggleNewApiDropdown);
  document.addEventListener("click", function (e) {
    var dd = document.getElementById("newApiDropdown");
    if (dd && !e.target.closest("#newApiEntryBtn") && !e.target.closest("#newApiDropdown")) {
      dd.style.display = "none";
    }
  });
  var namingBtn = document.getElementById("newApiModelNamingBtn");
  if (namingBtn) namingBtn.addEventListener("click", function () {
    document.getElementById("newApiDropdown").style.display = "none";
    openNewApiModal();
  });
  var tqBtn = document.getElementById("newApiTokenQueryBtn");
  if (tqBtn) tqBtn.addEventListener("click", function () {
    document.getElementById("newApiDropdown").style.display = "none";
    if (typeof openTokenQueryModal === "function") openTokenQueryModal();
  });
  var ocgBtn = document.getElementById("newApiOpCodeGoBtn");
  if (ocgBtn) ocgBtn.addEventListener("click", function () {
    document.getElementById("newApiDropdown").style.display = "none";
    try {
      if (typeof openOpCodeGoModal === "function") openOpCodeGoModal();
      else if (window.openOpCodeGoModal) window.openOpCodeGoModal();
      else window.showToast("OpCode Go 看板未就绪，请稍后再试", "warning");
    } catch (e) {
      window.showToast("打开看板失败：" + (e.message || e), "error");
    }
  });
  if (els.closeNewApiBtn) els.closeNewApiBtn.addEventListener("click", function () { closeModal(els.newApiModal); });
  if (els.newApiModal) els.newApiModal.addEventListener("click", function (e) { if (e.target === els.newApiModal) closeModal(els.newApiModal); });
  if (els.newApiEnabledInput) els.newApiEnabledInput.addEventListener("change", function () {
    AppState.settings.newApiEnabled = !!els.newApiEnabledInput.checked;
    saveSettings();
    updateNewApiEntryVisibility();
    showToast(AppState.settings.newApiEnabled ? "NewAPI 入口已开启" : "NewAPI 入口已关闭", "success");
  });
  if (els.newApiLoadChannelBtn) els.newApiLoadChannelBtn.addEventListener("click", loadNewApiChannelModels);
  if (els.newApiChannelSelect) els.newApiChannelSelect.addEventListener("change", clearNewApiModelsOnly);
  if (els.newApiGenerateBtn) els.newApiGenerateBtn.addEventListener("click", generateNewApiNames);
  if (els.newApiClearBtn) els.newApiClearBtn.addEventListener("click", clearNewApiTool);
  if (els.newApiCopyResultBtn) els.newApiCopyResultBtn.addEventListener("click", function () { copyText(els.newApiResultOutput.value, "模型结果已复制"); });
  if (els.newApiCopyMappingBtn) els.newApiCopyMappingBtn.addEventListener("click", function () { copyText(els.newApiMappingOutput.value, "模型映射已复制"); });
  if (els.newApiSuffixInput) els.newApiSuffixInput.addEventListener("keydown", function (e) { if (e.key === "Enter") generateNewApiNames(); });
  if (els.newApiModelsInput) els.newApiModelsInput.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); generateNewApiNames(); }
  });
}

function toggleNewApiDropdown() {
  var dd = document.getElementById("newApiDropdown");
  if (!dd) return;
  var btn = AppState.els.newApiEntryBtn;
  if (!btn) return;
  var rect = btn.getBoundingClientRect();
  dd.style.display = dd.style.display === "flex" ? "none" : "flex";
  dd.style.top = (rect.bottom + 4) + "px";
  dd.style.right = (window.innerWidth - rect.right) + "px";
  dd.style.left = "auto";
}

function openNewApiModal() {
  populateNewApiChannelSelect();
  clearNewApiModelsOnly();
  openModal(AppState.els.newApiModal);
}

function populateNewApiChannelSelect() {
  var sel = AppState.els.newApiChannelSelect;
  if (!sel) return;
  var channels = AppState.channels.slice().sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN");
  });
  sel.innerHTML = channels.length
    ? channels.map(function (ch) {
        var count = ch.models ? ch.models.length : 0;
        var text = (ch.name || "未命名渠道") + " / " + (ch.group || "default") + " / " + count + " 模型";
        return '<option value="' + escapeAttr(ch.id) + '">' + escapeHtml(text) + '</option>';
      }).join("")
    : '<option value="">暂无渠道</option>';
}

function parseNewApiModels(text) {
  return uniqueArray(String(text || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean));
}

function getModelsByChannel(channelId) {
  var ch = AppState.channels.find(function (item) { return item.id === channelId; });
  return ch && ch.models ? ch.models : [];
}

function clearNewApiModelsOnly() {
  if (AppState.els.newApiModelsInput) AppState.els.newApiModelsInput.value = "";
  if (AppState.els.newApiResultOutput) AppState.els.newApiResultOutput.value = "";
  if (AppState.els.newApiMappingOutput) AppState.els.newApiMappingOutput.value = "";
  if (AppState.els.newApiCountDisplay) AppState.els.newApiCountDisplay.textContent = "0";
}

function loadNewApiChannelModels() {
  var channelId = AppState.els.newApiChannelSelect ? AppState.els.newApiChannelSelect.value : "";
  var models = getModelsByChannel(channelId);
  AppState.els.newApiModelsInput.value = models.join(",");
  AppState.els.newApiResultOutput.value = "";
  AppState.els.newApiMappingOutput.value = "";
  AppState.els.newApiCountDisplay.textContent = models.length;
  if (!models.length) showToast("该渠道暂无模型，可手动输入", "warning");
}

function generateNewApiNames() {
  var models = parseNewApiModels(AppState.els.newApiModelsInput.value);
  var suffix = AppState.els.newApiSuffixInput.value.trim();
  if (!models.length) { showToast("请输入模型列表，多个模型用英文逗号分隔", "warning"); return; }
  if (!suffix) { showToast("请输入自定义后缀", "warning"); return; }
  var resultModels = models.map(function (m) { return m + "-" + suffix; });
  var mapping = {};
  models.forEach(function (m) { mapping[m + "-" + suffix] = m; });
  AppState.els.newApiResultOutput.value = resultModels.join(",");
  AppState.els.newApiMappingOutput.value = safeJsonStringify(mapping);
  AppState.els.newApiCountDisplay.textContent = models.length;
  showToast("生成成功", "success");
}

function clearNewApiTool() {
  AppState.els.newApiModelsInput.value = "";
  AppState.els.newApiSuffixInput.value = "";
  AppState.els.newApiResultOutput.value = "";
  AppState.els.newApiMappingOutput.value = "";
  AppState.els.newApiCountDisplay.textContent = "0";
  showToast("已清空", "success");
}
