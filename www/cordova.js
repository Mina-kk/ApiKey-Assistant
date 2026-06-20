// 浏览器调试占位：真实 Android 构建时会被 Cordova 自动生成覆盖
if (!window.cordova) {
  window.cordova = {
    platformId: "browser",
    plugin: {},
    plugins: {}
  };
}
