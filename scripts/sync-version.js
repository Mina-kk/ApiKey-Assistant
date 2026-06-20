const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = (p) => path.join(root, p);

function read(p) { return fs.readFileSync(file(p), 'utf8'); }
function write(p, s) { fs.writeFileSync(file(p), s); }
function exists(p) { return fs.existsSync(file(p)); }

function parseVersionCode(version) {
  var m = String(version || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error('无法识别版本号：' + version);
  return String(Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]));
}

// ---- 1. 读取 config.xml 中的版本号 ----
var config = read('config.xml');
var versionMatch = config.match(/<widget[^>]*\sversion="([^"]+)"/);
if (!versionMatch) throw new Error('config.xml 未找到 widget version');
var version = versionMatch[1];
var versionCode = parseVersionCode(version);

// ---- 2. 更新 config.xml android-versionCode ----
if (/android-versionCode="\d+"/.test(config)) {
  config = config.replace(/android-versionCode="\d+"/, 'android-versionCode="' + versionCode + '"');
} else {
  config = config.replace(/(<widget\b[^>]*\sversion="[^"]+")/, '$1 android-versionCode="' + versionCode + '"');
}
write('config.xml', config);

// ---- 3. 更新 package.json / package-lock.json ----
['package.json', 'package-lock.json'].forEach(function (p) {
  if (!exists(p)) return;
  try {
    var data = JSON.parse(read(p));
    data.version = version;
    if (data.packages && data.packages['']) data.packages[''].version = version;
    write(p, JSON.stringify(data, null, 2) + '\n');
  } catch (e) { console.warn('跳过 ' + p + ':', e.message); }
});

// ---- 4. 更新 www 源码中的版本号 ----
if (exists('www/js/update.js')) {
  var s = read('www/js/update.js');
  s = s.replace(/var APP_CURRENT_VERSION = "[^"]+";/, 'var APP_CURRENT_VERSION = "' + version + '";');
  write('www/js/update.js', s);
}

if (exists('www/index.html')) {
  var s = read('www/index.html');
  s = s.replace(/(<span id="aboutVersionText">当前版本：)[^<]+(<\/span>)/, '$1' + version + '$2');
  write('www/index.html', s);
}

// ---- 5. 同步 www -> platforms/android/app/src/main/assets/www（全量同步） ----
var wwwDir = file('www');
var assetsDir = file('platforms/android/app/src/main/assets/www');
function syncDir(src, dst) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dst)) return;
  var items;
  try { items = fs.readdirSync(src, { withFileTypes: true }); } catch (e) { return; }
  items.forEach(function (entry) {
    var sPath = path.join(src, entry.name);
    var dPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(dPath)) try { fs.mkdirSync(dPath, { recursive: true }); } catch (e) {}
      syncDir(sPath, dPath);
    } else {
      try { fs.copyFileSync(sPath, dPath); } catch (e) {}
    }
  });
}
syncDir(wwwDir, assetsDir);

// ---- 6. 同步 manifests ----
if (exists('platforms/android/app/src/main/res/xml/config.xml')) {
  var s = read('platforms/android/app/src/main/res/xml/config.xml');
  s = s.replace(/(<widget[^>]*\sversion=")[^"]+/, '$1' + version);
  if (/android-versionCode="\d+"/.test(s)) {
    s = s.replace(/android-versionCode="\d+"/, 'android-versionCode="' + versionCode + '"');
  } else {
    s = s.replace(/(<widget\b[^>]*\sversion="[^"]+")/, '$1 android-versionCode="' + versionCode + '"');
  }
  write('platforms/android/app/src/main/res/xml/config.xml', s);
}

if (exists('platforms/android/app/src/main/AndroidManifest.xml')) {
  var s = read('platforms/android/app/src/main/AndroidManifest.xml');
  s = s.replace(/android:versionCode="\d+"/, 'android:versionCode="' + versionCode + '"');
  s = s.replace(/android:versionName="[^"]+"/, 'android:versionName="' + version + '"');
  write('platforms/android/app/src/main/AndroidManifest.xml', s);
}

console.log('版本同步完成：version=' + version + ', versionCode=' + versionCode);
