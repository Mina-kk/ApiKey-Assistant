// 自动更新与关于页

var APP_REPO_URL = "https://github.com/Mina-kk/ApiKey-Assistant";
var APP_RELEASES_URL = APP_REPO_URL + "/releases";
var APP_LATEST_RELEASE_API = "https://api.github.com/repos/Mina-kk/ApiKey-Assistant/releases/latest";
var APP_TAGS_API = "https://api.github.com/repos/Mina-kk/ApiKey-Assistant/tags";
var APP_CURRENT_VERSION = "3.0.61";
var latestUpdateInfo = null;
var updateAutoCloseTimer = null;
var updateAutoCloseLeft = 0;

function normalizeVersion(v) {
  return String(v || "").trim().replace(/^v/i, "").split(/[+-]/)[0];
}

function compareVersions(a, b) {
  var pa = normalizeVersion(a).split(".").map(function (x) { return parseInt(x, 10) || 0; });
  var pb = normalizeVersion(b).split(".").map(function (x) { return parseInt(x, 10) || 0; });
  var len = Math.max(pa.length, pb.length);
  for (var i = 0; i < len; i++) {
    var da = pa[i] || 0;
    var db = pb[i] || 0;
    if (i >= 2) {
      var aLen = String(da).length;
      var bLen = String(db).length;
      if (aLen < bLen) da = da * Math.pow(10, bLen - aLen);
      else if (bLen < aLen) db = db * Math.pow(10, aLen - bLen);
    }
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function openExternalUrl(url) {
  url = String(url || APP_REPO_URL);
  try {
    if (window.cordova && window.cordova.InAppBrowser) {
      window.cordova.InAppBrowser.open(url, "_system");
      return;
    }
    var ref = window.open(url, "_system");
    if (ref) return;
  } catch (e) {}
  try { window.open(url, "_blank"); return; } catch (e2) {}
  try { location.href = url; } catch (e3) { copyText(url, "跳转失败，地址已复制，请自行打开"); }
}

function getBestDownloadUrl(release) {
  if (!release) return APP_RELEASES_URL;
  var assets = Array.isArray(release.assets) ? release.assets : [];
  var apk = assets.find(function (a) { return /\.apk$/i.test(a.name || ""); });
  return (apk && apk.browser_download_url) || release.html_url || APP_RELEASES_URL;
}

function renderVersionCompare(repoVersion, statusText) {
  return (
    '<div class="version-compare">' +
      '<div><span>仓库当前版本</span><b>' + escapeHtml(repoVersion || "未知") + '</b></div>' +
      '<div><span>程序当前版本</span><b>' + escapeHtml(APP_CURRENT_VERSION) + '</b></div>' +
    '</div>' +
    (statusText ? '<div class="update-status-text">' + statusText + '</div>' : '')
  );
}

function setUpdateInfo(html, type, url) {
  if (AppState.els.updateInfoBox) AppState.els.updateInfoBox.innerHTML = html;
  if (AppState.els.updateInfoBox) AppState.els.updateInfoBox.className = "update-card" + (type ? " " + type : "");
  if (AppState.els.updateDownloadUrl) AppState.els.updateDownloadUrl.textContent = url || APP_RELEASES_URL;
}

function clearUpdateAutoClose() {
  if (updateAutoCloseTimer) clearInterval(updateAutoCloseTimer);
  updateAutoCloseTimer = null;
  updateAutoCloseLeft = 0;
}

function startUpdateAutoClose(seconds) {
  clearUpdateAutoClose();
  updateAutoCloseLeft = seconds || 10;
  function renderCountdown() {
    var el = document.getElementById("updateAutoCloseText");
    if (el) el.textContent = updateAutoCloseLeft + " 秒后自动关闭，可手动关闭或点击下载。";
  }
  renderCountdown();
  updateAutoCloseTimer = setInterval(function () {
    updateAutoCloseLeft -= 1;
    renderCountdown();
    if (updateAutoCloseLeft <= 0) {
      clearUpdateAutoClose();
      closeModal(AppState.els.updateModal);
    }
  }, 1000);
}

function fetchJson(url) {
  return fetch(url, { headers: { "Accept": "application/vnd.github+json" }, cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}

function checkForUpdates(silent) {
  if (!silent) {
    clearUpdateAutoClose();
    latestUpdateInfo = null;
    setUpdateInfo(renderVersionCompare("正在获取", "正在检查 GitHub 最新版本..."), "", APP_RELEASES_URL);
    openModal(AppState.els.updateModal);
  }

  return fetchJson(APP_LATEST_RELEASE_API).then(function (release) {
    var latestVersion = release.tag_name || release.name || "";
    var downloadUrl = getBestDownloadUrl(release);
    latestUpdateInfo = { version: latestVersion, release: release, downloadUrl: downloadUrl };
    var hasUpdate = compareVersions(latestVersion, APP_CURRENT_VERSION) > 0;
    if (hasUpdate) {
      var body = release.body ? '<div class="release-note">' + escapeHtml(release.body).replace(/\n/g, "<br>") + '</div>' : "";
      setUpdateInfo(
        renderVersionCompare(latestVersion, "发现新版本，可前往下载更新。") + body,
        "success",
        downloadUrl
      );
      if (silent) {
        openModal(AppState.els.updateModal);
        startUpdateAutoClose(10);
      }
      return true;
    }
    setUpdateInfo(renderVersionCompare(latestVersion, "当前程序版本不低于仓库版本，无需更新。"), "", downloadUrl);
    if (!silent) {
      clearUpdateAutoClose();
      showToast("当前已是最新版本", "success");
    }
    return false;
  }).catch(function (err) {
    return fetchJson(APP_TAGS_API).then(function (tags) {
      var tag = Array.isArray(tags) && tags[0] ? tags[0].name : "";
      var hasUpdate = tag && compareVersions(tag, APP_CURRENT_VERSION) > 0;
      latestUpdateInfo = { version: tag, release: null, downloadUrl: APP_RELEASES_URL };
      if (hasUpdate) {
        setUpdateInfo(
          renderVersionCompare(tag, "发现新版本标签，但未找到可自动下载的 APK，请到 GitHub 发布页自行下载。"),
          "success",
          APP_RELEASES_URL
        );
        if (silent) {
          openModal(AppState.els.updateModal);
          startUpdateAutoClose(10);
        }
        return true;
      }
      setUpdateInfo(renderVersionCompare(tag || "未获取到", "当前程序版本不低于仓库版本，无需更新。"), "", APP_RELEASES_URL);
      return false;
    }).catch(function () {
      var msg = renderVersionCompare("获取失败", "检查更新失败：" + escapeHtml(err && err.message ? err.message : "网络异常") + "<br>请自行打开 GitHub 下载地址。");
      setUpdateInfo(msg, "error", APP_RELEASES_URL);
      if (!silent) showToast("检查更新失败，请自行打开下载地址", "error");
      return false;
    });
  });
}

function openAboutModal() {
  if (AppState.els.aboutVersionText) AppState.els.aboutVersionText.textContent = "当前版本：" + APP_CURRENT_VERSION;
  openModal(AppState.els.aboutModal);
}

function downloadLatestUpdate() {
  var url = latestUpdateInfo && latestUpdateInfo.downloadUrl ? latestUpdateInfo.downloadUrl : APP_RELEASES_URL;
  try {
    openExternalUrl(url);
    showToast("已尝试打开下载地址。若失败，请复制地址自行下载。", "info");
  } catch (e) {
    copyText(url, "下载跳转失败，地址已复制，请自行下载");
  }
}
