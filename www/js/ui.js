// ============================================================
// UI 渲染层
// ============================================================

function cacheElements() {
  var ids = [
    "menuBtn", "searchToggleBtn", "themeBtn", "moreBtn", "appBarSubtitle",
    "proxyStatusBar", "proxyStatusText", "proxyLatencyText",
    "searchPanel", "searchInput", "clearSearchBtn",
    "totalConfig", "totalGroups", "totalKeys", "totalModels",
    "batchBar", "batchSelectAll", "batchCount", "batchGroupSelect", "batchMoveGroupBtn",
    "batchEnableBtn", "batchDisableBtn", "batchFetchModelsBtn", "batchDeleteBtn", "batchCancelBtn",
    "cardsContainer",
    "drawerMask", "drawer", "closeDrawerBtn", "groupList", "manageGroupsBtn",
    "moreMenu",
    "menuImportBtn", "menuExportBtn", "menuSettingsBtn", "menuSortBtn", "menuBatchBtn",
    "menuClearAllModelsBtn", "menuFetchAllModelsBtn", "menuTestBtn", "menuLogBtn",
    "editorModal", "editorTitle", "closeEditorBtn", "cancelEditorBtn", "saveChannelBtn",
    "editingId", "nameInput", "typeInput", "groupInput", "baseUrlInput", "copyBaseInEditorBtn",
    "priorityInput", "weightInput", "statusInput", "tagInput", "remarkInput",
    "multiKeyModeInput", "autoBanInput", "keyRows", "addKeyBtn",
    "testModelInput", "modelInput", "addModelBtn", "editModelMappingBtn", "clearEditModelsBtn",
    "modelEditList", "fetchModelsInEditorBtn", "editorStatus",
    "paramOverrideInput", "headerOverrideInput", "otherSettingsInput",
    "modelMappingModal", "closeModelMappingBtn", "cancelModelMappingBtn", "saveModelMappingBtn",
    "mappingList", "addMappingBtn",
    "testModal", "closeTestBtn", "closeTestFooterBtn", "testKeySelect", "testModelSelect",
    "testPromptInput", "startTestBtn", "testResultBox",
    "importModal", "closeImportBtn", "cancelImportBtn", "confirmImportBtn", "readClipboardBtn", "importTextarea",
    "exportModal", "closeExportBtn", "exportCopyBtn",
    "settingsModal", "closeSettingsBtn", "timeoutInput", "concurrencyInput", "defaultPromptInput", "clearAllDataBtn",
    "groupModal", "closeGroupBtn", "newGroupInput", "addGroupBtn", "groupManageList",
    "sortModal", "closeSortBtn", "logModal", "closeLogBtn", "copyLogBtn", "clearLogBtn", "logOutput",
    "addBtn", "toast"
  ];
  ids.forEach(function (id) { AppState.els[id] = $(id); });
}

function renderAll() {
  AppState.groups = loadGroups();
  renderStats();
  renderDrawerGroups();
  populateBatchGroupSelect();
  renderCards();
}

function renderStats() {
  var channels = AppState.channels;
  AppState.els.totalConfig.textContent = channels.length;
  AppState.els.totalGroups.textContent = AppState.groups.length;
  AppState.els.totalKeys.textContent = channels.reduce(function (sum, ch) { return sum + (ch.keys ? ch.keys.length : 0); }, 0);
  AppState.els.totalModels.textContent = channels.reduce(function (sum, ch) { return sum + uniqueArray(ch.models).length; }, 0);
}

function renderDrawerGroups() {
  var list = AppState.els.groupList;
  var counts = {};
  AppState.channels.forEach(function (ch) {
    counts[ch.group || "default"] = (counts[ch.group || "default"] || 0) + 1;
  });

  var items = [{ name: "", label: "全部渠道", count: AppState.channels.length }].concat(
    AppState.groups.map(function (g) {
      return { name: g, label: g, count: counts[g] || 0 };
    })
  );

  list.innerHTML = items.map(function (item) {
    var active = AppState.currentGroup === item.name ? "active" : "";
    return (
      '<button class="group-item ' + active + '" data-group="' + escapeAttr(item.name) + '" type="button">' +
        '<span>' + escapeHtml(item.label) + '</span>' +
        '<span class="count">' + item.count + '</span>' +
      '</button>'
    );
  }).join("");
}

function getFilteredChannels() {
  var keyword = AppState.els.searchInput.value.trim().toLowerCase();
  AppState.searchKeyword = keyword;
  return AppState.channels.filter(function (ch) {
    if (AppState.currentGroup && ch.group !== AppState.currentGroup) return false;
    if (!keyword) return true;
    var name = String(ch.name || "").toLowerCase();
    var baseUrl = String(ch.base_url || "").toLowerCase();
    var provider = getProviderLabel(ch.type).toLowerCase();
    var group = String(ch.group || "").toLowerCase();
    var tag = String(ch.tag || "").toLowerCase();
    var models = uniqueArray(ch.models || []);
    return (
      name.indexOf(keyword) !== -1 ||
      baseUrl.indexOf(keyword) !== -1 ||
      provider.indexOf(keyword) !== -1 ||
      group.indexOf(keyword) !== -1 ||
      tag.indexOf(keyword) !== -1 ||
      models.some(function (m) { return m.toLowerCase().indexOf(keyword) !== -1; })
    );
  }).sort(getSortComparator());
}

function getSortComparator() {
  var sortBy = AppState.sortBy;
  var order = AppState.sortOrder === "asc" ? 1 : -1;
  return function (a, b) {
    var va, vb;
    if (sortBy === "name") { va = a.name || ""; vb = b.name || ""; }
    else if (sortBy === "priority") { va = a.priority || 0; vb = b.priority || 0; }
    else if (sortBy === "weight") { va = a.weight || 0; vb = b.weight || 0; }
    else if (sortBy === "response_time") { va = a.response_time || 0; vb = b.response_time || 0; }
    else if (sortBy === "updated_time") { va = a.updated_time || 0; vb = b.updated_time || 0; }
    else { va = a.priority || 0; vb = b.priority || 0; }

    if (typeof va === "string") {
      return va.localeCompare(vb, "zh-Hans-CN") * order;
    }
    return (va > vb ? 1 : va < vb ? -1 : 0) * order;
  };
}

function renderCards() {
  var filtered = getFilteredChannels();
  var keyword = AppState.searchKeyword;

  if (!filtered.length) {
    AppState.els.cardsContainer.innerHTML =
      '<div class="empty-state">' +
      '<strong>暂无渠道</strong>' +
      '<span>点击右下角 + 添加 API Key</span>' +
      '</div>';
    return;
  }

  AppState.els.cardsContainer.innerHTML = filtered.map(function (ch) {
    return renderCard(ch, keyword);
  }).join("");
}

function renderCard(ch, keyword) {
  var keys = ch.keys || [];
  var models = uniqueArray(ch.models || []);
  var providerLabel = getProviderLabel(ch.type);
  var disabledClass = ch.status === 0 ? "disabled" : "";
  var selectedClass = AppState.selectedChannels[ch.id] ? "selected" : "";
  var selectHtml = AppState.batchMode
    ? '<input type="checkbox" class="card-select" data-action="select-card" data-id="' + escapeAttr(ch.id) + '"' + (AppState.selectedChannels[ch.id] ? " checked" : "") + ' />'
    : "";

  var toggleButton = "";
  if (models.length > MODEL_COLLAPSE_LIMIT) {
    toggleButton = '<button class="copy-mini-btn" data-action="toggle-models" type="button">' + (AppState.expandedModels[ch.id] ? "收起" : "展开") + '</button>';
  }

  var clearButton = models.length ? '<button class="danger-btn small-btn" data-action="clear-models" type="button">清空</button>' : "";

  var statusBadge = ch.status === 0 ? '<span class="badge danger">已禁用</span>' : "";

  return (
    '<article class="api-card ' + disabledClass + " " + selectedClass + '" data-id="' + escapeAttr(ch.id) + '">' +
      selectHtml +
      '<div class="card-head">' +
        '<div class="card-title">' +
          '<h3>' + escapeHtml(ch.name) + '</h3>' +
          '<div class="badges">' +
            '<span class="badge">' + escapeHtml(providerLabel) + '</span>' +
            '<span class="badge gray">' + keys.length + ' Key</span>' +
            '<span class="badge gray">' + models.length + ' 模型</span>' +
            (ch.group && ch.group !== "default" ? '<span class="badge gray">' + escapeHtml(ch.group) + '</span>' : "") +
            statusBadge +
          '</div>' +
        '</div>' +
        '<div class="card-actions">' +
          '<button class="small-btn" data-action="edit" type="button">编辑</button>' +
          '<button class="danger-btn small-btn" data-action="delete" type="button">删除</button>' +
        '</div>' +
      '</div>' +
      '<div class="info-block">' +
        '<div class="info-title-row">' +
          '<div class="info-label">Base URL</div>' +
          '<button class="copy-mini-btn" data-action="copy-base" type="button">复制</button>' +
        '</div>' +
        '<div class="mono-box">' + escapeHtml(ch.base_url) + '</div>' +
      '</div>' +
      '<div class="info-block">' +
        '<div class="info-label">API Key 列表</div>' +
        '<div class="key-list">' + keys.map(function (key) { return renderKeyItem(key); }).join("") + '</div>' +
      '</div>' +
      '<div class="info-block">' +
        '<div class="info-title-row">' +
          '<div class="info-label">模型列表</div>' +
          '<div class="card-actions">' + toggleButton + clearButton + '</div>' +
        '</div>' +
        '<div class="models-wrap">' + renderModelPills(ch, keyword) + '</div>' +
      '</div>' +
      '<div class="card-bottom-actions">' +
        '<button data-action="copy-all-keys" type="button">📋 复制全部</button>' +
        '<button data-action="copy-config" type="button">📋 配置</button>' +
        '<button class="primary-btn" data-action="fetch-models-browser" type="button">🚀 获取模型</button>' +
      '</div>' +
      '<div class="card-meta">' +
        '<span>优先级 ' + (ch.priority || 0) + '</span>' +
        '<span>权重 ' + (ch.weight || 0) + '</span>' +
        '<span>响应 ' + formatDuration(ch.response_time) + '</span>' +
        '<span>更新 ' + formatTime(ch.updated_time) + '</span>' +
      '</div>' +
    '</article>'
  );
}

function renderKeyItem(key) {
  return (
    '<div class="key-item">' +
      '<div class="key-name">' + escapeHtml(key.label || "Key") + '</div>' +
      '<div class="key-value">' + escapeHtml(maskKey(key.value)) + '</div>' +
      '<button class="copy-mini-btn" data-action="copy-key" data-key-id="' + escapeAttr(key.id) + '" type="button">复制</button>' +
    '</div>'
  );
}

function renderModelPills(ch, keyword) {
  var models = uniqueArray(ch.models || []);
  if (keyword) {
    var matching = models.filter(function (m) { return m.toLowerCase().indexOf(keyword) !== -1; });
    if (matching.length) models = matching;
  }
  if (!models.length) return '<span class="info-label">暂无模型</span>';
  var expanded = !!AppState.expandedModels[ch.id];
  var needCollapse = models.length > MODEL_COLLAPSE_LIMIT;
  var visible = needCollapse && !expanded ? models.slice(0, MODEL_COLLAPSE_LIMIT) : models;
  var html = visible.map(function (model) {
    return '<span class="model-pill" data-action="copy-model" data-model="' + escapeAttr(model) + '">' + escapeHtml(model) + '</span>';
  }).join("");
  if (needCollapse && !expanded) {
    html += '<span class="model-pill model-more">+' + (models.length - MODEL_COLLAPSE_LIMIT) + '</span>';
  }
  return html;
}

function populateTypeSelect() {
  var sel = AppState.els.typeInput;
  var options = [
    [ChannelType.OpenAI, "OpenAI"],
    [ChannelType.Anthropic, "Anthropic (Claude)"],
    [ChannelType.Gemini, "Google Gemini"],
    [ChannelType.Azure, "Azure OpenAI"],
    [ChannelType.DeepSeek, "DeepSeek"],
    [ChannelType.Moonshot, "Moonshot"],
    [ChannelType.Ali, "Ali (DashScope)"],
    [ChannelType.Zhipu, "Zhipu"],
    [ChannelType.SiliconFlow, "SiliconFlow"],
    [ChannelType.OpenRouter, "OpenRouter"],
    [ChannelType.Cohere, "Cohere"],
    [ChannelType.Jina, "Jina"],
    [ChannelType.MiniMax, "MiniMax"],
    [ChannelType.Ollama, "Ollama"],
    [ChannelType.Custom, "自定义 OpenAI 兼容"]
  ];
  sel.innerHTML = options.map(function (o) {
    return '<option value="' + o[0] + '">' + escapeHtml(o[1]) + '</option>';
  }).join("");
}

function populateGroupSelect(selectedGroup) {
  var sel = AppState.els.groupInput;
  AppState.groups = loadGroups();
  var value = selectedGroup || sel.value || "default";
  if (AppState.groups.indexOf(value) === -1) AppState.groups.push(value);
  AppState.groups.sort();
  sel.innerHTML = AppState.groups.map(function (g) {
    return '<option value="' + escapeAttr(g) + '">' + escapeHtml(g) + '</option>';
  }).join("");
  sel.value = value;
}

function populateBatchGroupSelect() {
  var sel = AppState.els.batchGroupSelect;
  if (!sel) return;
  AppState.groups = loadGroups();
  sel.innerHTML = AppState.groups.map(function (g) {
    return '<option value="' + escapeAttr(g) + '">' + escapeHtml(g) + '</option>';
  }).join("");
  sel.value = AppState.currentGroup || "default";
}

function openAddEditor() {
  try {
    AppState.els.editorTitle.textContent = "新增渠道";
    AppState.els.editingId.value = "";
    AppState.els.nameInput.value = "";
    AppState.els.typeInput.value = ChannelType.OpenAI;
    populateGroupSelect(AppState.currentGroup || "default");
    AppState.els.baseUrlInput.value = ChannelBaseURLs[ChannelType.OpenAI];
    AppState.els.priorityInput.value = 0;
    AppState.els.weightInput.value = 0;
    AppState.els.statusInput.checked = true;
    AppState.els.tagInput.value = "";
    AppState.els.remarkInput.value = "";
    AppState.els.multiKeyModeInput.value = MultiKeyMode.Single;
    AppState.els.autoBanInput.checked = true;
    AppState.els.testModelInput.value = "";
    AppState.els.paramOverrideInput.value = "";
    AppState.els.headerOverrideInput.value = "";
    AppState.els.otherSettingsInput.value = "";
    AppState.els.keyRows.innerHTML = "";
    AppState.editModels = [];
    AppState.editMappings = [];
    addKeyRow("Key 1", "");
    renderEditModels();
    renderMappingList();
    setStatus(AppState.els.editorStatus, "");
    openModal(AppState.els.editorModal);
  } catch (err) {
    console.error("openAddEditor error:", err);
    showToast("打开编辑器失败: " + err.message, "error");
  }
}

function openEditEditor(ch) {
  AppState.els.editorTitle.textContent = "编辑渠道";
  AppState.els.editingId.value = ch.id;
  AppState.els.nameInput.value = ch.name || "";
  AppState.els.typeInput.value = ch.type;
  populateGroupSelect(ch.group || "default");
  AppState.els.baseUrlInput.value = ch.base_url || "";
  AppState.els.priorityInput.value = ch.priority != null ? ch.priority : 0;
  AppState.els.weightInput.value = ch.weight != null ? ch.weight : 0;
  AppState.els.statusInput.checked = ch.status !== 0;
  AppState.els.tagInput.value = ch.tag || "";
  AppState.els.remarkInput.value = ch.remark || "";
  AppState.els.multiKeyModeInput.value = (ch.channel_info && ch.channel_info.multi_key_mode != null) ? ch.channel_info.multi_key_mode : MultiKeyMode.Single;
  AppState.els.autoBanInput.checked = ch.auto_ban !== 0;
  AppState.els.testModelInput.value = ch.test_model || "";
  AppState.els.paramOverrideInput.value = ch.param_override || "";
  AppState.els.headerOverrideInput.value = ch.header_override || "";
  AppState.els.otherSettingsInput.value = ch.other_settings || "";
  AppState.els.keyRows.innerHTML = "";
  var keys = ch.keys || [];
  if (keys.length) {
    keys.forEach(function (k) { addKeyRow(k.label, k.value, k.id); });
  } else {
    addKeyRow("Key 1", "");
  }
  AppState.editModels = uniqueArray(ch.models || []);
  AppState.editMappings = modelMappingToArray(ch.model_mapping);
  renderEditModels();
  renderMappingList();
  setStatus(AppState.els.editorStatus, "");
  openModal(AppState.els.editorModal);
}

function modelMappingToArray(mapping) {
  var obj = parseModelMapping(mapping);
  var arr = [];
  for (var key in obj) {
    arr.push({ from: key, to: obj[key] });
  }
  return arr;
}

function addKeyRow(label, value, id) {
  var row = document.createElement("div");
  row.className = "key-row";
  row.dataset.keyId = id || createId();
  row.innerHTML =
    '<input class="key-label-input" type="text" placeholder="标签" value="' + escapeAttr(label || "") + '" />' +
    '<input class="key-value-input" type="password" placeholder="API Key" value="' + escapeAttr(value || "") + '" />' +
    '<div class="key-row-actions">' +
      '<button class="small-btn key-toggle-btn" type="button">显示</button>' +
      '<button class="danger-btn small-btn key-remove-btn" type="button">删除</button>' +
    '</div>';
  var input = row.querySelector(".key-value-input");
  var toggle = row.querySelector(".key-toggle-btn");
  var remove = row.querySelector(".key-remove-btn");
  toggle.addEventListener("click", function () {
    input.type = input.type === "password" ? "text" : "password";
    toggle.textContent = input.type === "password" ? "显示" : "隐藏";
  });
  remove.addEventListener("click", function () {
    var rows = AppState.els.keyRows.querySelectorAll(".key-row");
    if (rows.length <= 1) { showToast("至少保留一个 API Key", "warning"); return; }
    row.remove();
  });
  AppState.els.keyRows.appendChild(row);
}

function renderEditModels() {
  var box = AppState.els.modelEditList;
  if (!AppState.editModels.length) {
    box.innerHTML = '<span class="info-label">暂无模型</span>';
    return;
  }
  box.innerHTML = AppState.editModels.map(function (model) {
    return (
      '<span class="model-edit-item">' +
        '<span>' + escapeHtml(model) + '</span>' +
        '<button type="button" data-model="' + escapeAttr(model) + '">×</button>' +
      '</span>'
    );
  }).join("");
  box.querySelectorAll("button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      AppState.editModels = AppState.editModels.filter(function (m) { return m !== btn.dataset.model; });
      renderEditModels();
    });
  });
}

function renderMappingList() {
  var box = AppState.els.mappingList;
  if (!AppState.editMappings.length) {
    box.innerHTML = '<div class="info-label">暂无映射</div>';
    return;
  }
  box.innerHTML = AppState.editMappings.map(function (m, index) {
    return (
      '<div class="mapping-row" data-index="' + index + '">' +
        '<input type="text" class="mapping-from" placeholder="请求模型" value="' + escapeAttr(m.from) + '" />' +
        '<input type="text" class="mapping-to" placeholder="上游模型" value="' + escapeAttr(m.to) + '" />' +
        '<button class="danger-btn small-btn mapping-remove" type="button">×</button>' +
      '</div>'
    );
  }).join("");
  box.querySelectorAll(".mapping-remove").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var idx = Number(btn.closest(".mapping-row").dataset.index);
      AppState.editMappings.splice(idx, 1);
      renderMappingList();
    });
  });
}

function refreshTestSelects() {
  var keySelect = AppState.els.testKeySelect;
  var options = [];
  AppState.channels.forEach(function (ch) {
    var keys = ch.keys || [];
    keys.forEach(function (key) {
      options.push({ value: ch.id + "::" + key.id, text: ch.name + " / " + (key.label || "Key") });
    });
  });
  keySelect.innerHTML = options.length
    ? options.map(function (o) { return '<option value="' + escapeAttr(o.value) + '">' + escapeHtml(o.text) + '</option>'; }).join("")
    : '<option value="">暂无 API Key</option>';
  updateTestModelSelect();
}

function updateTestModelSelect() {
  var keyValue = AppState.els.testKeySelect.value;
  var modelSelect = AppState.els.testModelSelect;
  if (!keyValue) {
    modelSelect.innerHTML = '<option value="">暂无模型</option>';
    return;
  }
  var channelId = keyValue.split("::")[0];
  var ch = AppState.channels.find(function (c) { return c.id === channelId; });
  var models = uniqueArray(ch && ch.models ? ch.models : []);
  modelSelect.innerHTML = models.length
    ? models.map(function (m) { return '<option value="' + escapeAttr(m) + '">' + escapeHtml(m) + '</option>'; }).join("")
    : '<option value="">此渠道暂无模型</option>';
}

function renderGroupManageList() {
  var box = AppState.els.groupManageList;
  AppState.groups = loadGroups();
  box.innerHTML = AppState.groups.map(function (g) {
    var isDefault = g === "default";
    return (
      '<div class="group-manage-item" data-group="' + escapeAttr(g) + '">' +
        '<span>' + escapeHtml(g) + '</span>' +
        '<div class="card-actions">' +
          (isDefault ? "" : '<button class="small-btn rename-group-btn" type="button">重命名</button>') +
          (isDefault ? "" : '<button class="danger-btn small-btn delete-group-btn" type="button">删除</button>') +
        '</div>' +
      '</div>'
    );
  }).join("");
}
