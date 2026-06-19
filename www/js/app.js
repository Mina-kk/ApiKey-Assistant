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

  var activeModal = ["editorModal", "modelMappingModal", "testModal", "importModal", "exportModal", "settingsModal", "groupModal", "sortModal", "newApiModal"].find(function (id) {
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
