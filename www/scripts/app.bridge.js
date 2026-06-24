// Android 生命周期与桥接层

document.addEventListener("deviceready", onDeviceReady, false);

function onDeviceReady() {
  console.log("Cordova device ready");

  // 状态栏
  if (window.StatusBar) {
    var isLight = document.body.classList.contains("light");
    StatusBar.backgroundColorByHexString(isLight ? "#f8fafc" : "#070812");
    if (StatusBar.styleLightContent && !isLight) StatusBar.styleLightContent();
    if (StatusBar.styleDefault && isLight) StatusBar.styleDefault();
  }

  // 深色模式跟随系统变化
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
      applyTheme();
      if (window.StatusBar) {
        var isLight = document.body.classList.contains("light");
        StatusBar.backgroundColorByHexString(isLight ? "#f8fafc" : "#070812");
      }
    });
  }

  // Android 返回键
  if (window.cordova && window.cordova.platformId === "android") {
    document.addEventListener("backbutton", onBackButton, false);
  }

}

function onBackButton(e) {
  e.preventDefault();

  if (AppState.els.moreMenu.classList.contains("active")) {
    AppState.els.moreMenu.classList.remove("active");
    return;
  }

  if (AppState.els.drawer.classList.contains("active")) {
    closeDrawer();
    return;
  }

  var activeModal = ["editorModal", "modelMappingModal", "testModal", "importModal", "exportModal", "settingsModal", "groupModal", "sortModal", "updateModal", "aboutModal", "newApiModal", "logModal"].find(function (id) {
    return AppState.els[id] && AppState.els[id].classList.contains("active");
  });

  if (activeModal) {
    closeModal(AppState.els[activeModal]);
    return;
  }

  if (AppState.batchMode) {
    disableBatchMode();
    return;
  }

  if (AppState.els.searchPanel.classList.contains("active")) {
    AppState.els.searchPanel.classList.remove("active");
    AppState.els.searchInput.value = "";
    if (typeof renderCards === "function") renderCards();
    return;
  }

  // 默认退出应用
  if (navigator.app && navigator.app.exitApp) {
    navigator.app.exitApp();
  } else if (navigator.device && navigator.device.exitApp) {
    navigator.device.exitApp();
  }
}

// 监听主题变化以更新状态栏
function updateStatusBarColor() {
  if (!window.StatusBar) return;
  var isLight = document.body.classList.contains("light");
  StatusBar.backgroundColorByHexString(isLight ? "#f8fafc" : "#070812");
  if (isLight && StatusBar.styleDefault) StatusBar.styleDefault();
  else if (!isLight && StatusBar.styleLightContent) StatusBar.styleLightContent();
}

// 导出函数供 main.js 调用
window.updateStatusBarColor = updateStatusBarColor;

(function() {
  var ns = window.APIK = {};

  // state.js
  ns.ChannelType = window.ChannelType;
  ns.APIType = window.APIType;
  ns.ChannelTypeToAPIType = window.ChannelTypeToAPIType;
  ns.ChannelTypeNames = window.ChannelTypeNames;
  ns.MultiKeyMode = window.MultiKeyMode;
  ns.AppState = window.AppState;

  // utils.js
  ns.utils = {
    escapeHtml: window.escapeHtml,
    escapeAttr: window.escapeAttr,
    normalizeBaseUrl: window.normalizeBaseUrl,
    uniqueArray: window.uniqueArray,
    maskKey: window.maskKey,
    maskBaseUrl: window.maskBaseUrl,
    formatTime: window.formatTime,
    formatDuration: window.formatDuration,
    safeJsonParse: window.safeJsonParse,
    safeJsonStringify: window.safeJsonStringify,
    parseChannelKeys: window.parseChannelKeys,
    parseModelMapping: window.parseModelMapping,
    applyModelMapping: window.applyModelMapping,
    normalizeChannel: window.normalizeChannel,
    getChannelFirstKey: window.getChannelFirstKey,
    copyText: window.copyText,
    readClipboardText: window.readClipboardText,
    showToast: window.showToast,
    openModal: window.openModal,
    closeModal: window.closeModal,
    closeAllModals: window.closeAllModals,
    setStatus: window.setStatus,
    addLog: window.addLog,
    loadChannels: window.loadChannels,
    saveChannels: window.saveChannels,
    loadSettings: window.loadSettings,
    saveSettings: window.saveSettings,
    loadGroups: window.loadGroups,
    saveGroups: window.saveGroups
  };

  // api.js
  ns.api = {
    doHttpRequest: window.doHttpRequest,
    joinApiPath: window.joinApiPath,
    isOpenCodeZenBase: window.isOpenCodeZenBase,
    requestViaLocalProxyOrDirect: window.requestViaLocalProxyOrDirect,
    fetchUpstreamModels: window.fetchUpstreamModels,
    testChannel: window.testChannel,
    runWithConcurrency: window.runWithConcurrency
  };

  // ui.js
  ns.ui = {
    cacheElements: window.cacheElements,
    renderAll: window.renderAll,
    renderStats: window.renderStats,
    renderCards: window.renderCards,
    renderDrawerGroups: window.renderDrawerGroups,
    getFilteredChannels: window.getFilteredChannels,
    populateTypeSelect: window.populateTypeSelect,
    populateGroupSelect: window.populateGroupSelect,
    openAddEditor: window.openAddEditor,
    openEditEditor: window.openEditEditor
  };

  // features
  ns.features = {
    proxy: {
      startProxyMonitor: window.startProxyMonitor,
      stopProxyMonitor: window.stopProxyMonitor,
      checkProxyLatency: window.checkProxyLatency
    },
    batch: {
      enableBatchMode: window.enableBatchMode,
      disableBatchMode: window.disableBatchMode,
      batchSetStatus: window.batchSetStatus,
      batchMoveToGroup: window.batchMoveToGroup,
      batchDelete: window.batchDelete,
      batchFetchModels: window.batchFetchModels
    },
    models: {
      clearAllModels: window.clearAllModels,
      fetchAllModels: window.fetchAllModels,
      fetchModelsForCard: window.fetchModelsForCard,
      fetchModelsInEditor: window.fetchModelsInEditor
    },
    testing: {
      openTestModal: window.openTestModal,
      runChatTest: window.runChatTest
    }
  };

  // newapi.js
  ns.newapi = {
    initNewApiEvents: window.initNewApiEvents,
    updateNewApiEntryVisibility: window.updateNewApiEntryVisibility,
    openNewApiModal: window.openNewApiModal,
    generateNewApiNames: window.generateNewApiNames,
    toggleNewApiDropdown: window.toggleNewApiDropdown
  };

  // update.js
  ns.update = {
    APP_CURRENT_VERSION: window.APP_CURRENT_VERSION,
    APP_REPO_URL: window.APP_REPO_URL,
    APP_RELEASES_URL: window.APP_RELEASES_URL,
    checkForUpdates: window.checkForUpdates,
    openExternalUrl: window.openExternalUrl,
    openAboutModal: window.openAboutModal,
    downloadLatestUpdate: window.downloadLatestUpdate
  };

  // token-query.js
  ns.tokenQuery = {
    initTokenQuery: window.initTokenQuery,
    openTokenQueryModal: window.openTokenQueryModal
  };

  // opcode-go-usage.js
  ns.opcodeGo = {
    initOpCodeGo: window.initOpCodeGo,
    openOpCodeGoModal: window.openOpCodeGoModal
  };

  // app.js
  ns.app = {
    onDeviceReady: window.onDeviceReady,
    updateStatusBarColor: window.updateStatusBarColor
  };
})();
