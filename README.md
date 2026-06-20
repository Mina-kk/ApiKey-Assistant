# NewAPI Channels（Android）

基于 [QuantumNous/new-api](https://github.com/QuantumNous/new-api) 逻辑重写的移动端渠道管理工具，使用 Cordova 构建 Android 应用。

## 项目结构

```text
new-api-android/
├── config.xml          # Cordova 配置
├── package.json        # 依赖与脚本
├── res/                # Android 图标与启动图
├── www/                # 前端源码
│   ├── index.html      # 页面结构与弹窗入口
│   ├── css/style.css   # 全局样式、主题、移动端布局
│   └── js/
│       ├── state.js    # new-api 常量与全局状态
│       ├── utils.js    # Channel 标准化、存储、剪贴板、日志等工具
│       ├── api.js      # Adaptor、HTTP、模型获取、渠道测试
│       ├── ui.js       # UI 渲染
│       ├── main.js     # 初始化、事件绑定、业务操作
│       ├── newapi.js   # NewAPI 模型命名工具
│       └── app.js      # Android 生命周期与返回键处理
└── platforms/          # Cordova 生成的 Android 工程
```

> 日常维护优先修改 `www/` 目录。若没有执行 `cordova prepare android`，需要手动同步到 `platforms/android/app/src/main/assets/www/`，否则 Android 工程内页面不会更新。

## 功能特性

- 完全对齐 new-api 的 **Channel（渠道）** 数据模型。
- 支持 new-api 的 **ChannelType → APIType → Adaptor** 分发逻辑。
- 内置 OpenAI / Anthropic / Gemini 适配器，其余渠道走 OpenAI 兼容协议。
- 渠道新增、编辑、删除、复制配置、获取模型。
- 渠道分组管理，支持长分组名称省略显示，避免挤压操作按钮。
- 模型映射（Model Mapping）可视化编辑。
- 权重、优先级、状态、自动禁用等渠道属性。
- 多 Key 管理，支持单 Key、轮询、随机模式。
- 模型获取、批量获取、渠道测试；WebView 直连不可用时可通过本地代理兜底。
- 本地代理状态检测与运行日志，日志最多保留最近 30 条。
- 导入 / 导出 JSON 数据。
- 主题切换、搜索、排序、批量操作。
- 可选 NewAPI 模型命名工具入口。

## NewAPI 模型命名工具

### 入口开关

路径：`更多菜单 → 设置 → NewAPI 模型命名工具`

- 默认关闭。
- 开启后，顶部应用栏会在搜索、主题按钮右侧显示 `N` 入口。
- 关闭后入口隐藏，但不影响已有渠道数据。

### 功能说明

NewAPI 工具用于把当前 app 内渠道模型转换为 NewAPI 常用的模型命名与重定向格式。

支持两种模型来源：

1. **选择渠道导入**
   - 选择一个渠道。
   - 点击「导入渠道模型」后读取该渠道的 `models`。
   - 切换渠道会自动清空已导入模型和生成结果，避免混乱。

2. **手动输入**
   - 在模型列表输入框中输入模型。
   - 多个模型使用英文逗号 `,` 分隔。

生成规则：

```text
源模型：gpt-4o,deepseek-chat
后缀：opencode
结果：gpt-4o-opencode,deepseek-chat-opencode
```

模型重定向 JSON：

```json
{
  "gpt-4o-opencode": "gpt-4o",
  "deepseek-chat-opencode": "deepseek-chat"
}
```

## 网络与日志说明

- 获取模型和渠道测试共用 HTTP 请求逻辑。直连失败且本地代理可用时，会尝试通过 `AppState.settings.localProxyUrl` 访问目标接口。
- 默认本地代理地址为 `http://127.0.0.1:9527`。
- 运行日志仅记录应用初始化、模型获取过程、模型获取网络请求和全局错误。
- 日志最多保留最近 30 条，减少移动端页面渲染压力。

## 数据存储

使用 `localStorage` 持久化数据：

| 类型 | Key |
| --- | --- |
| 渠道数据 | `new_api_channels_v3` |
| 设置数据 | `new_api_settings_v3` |
| 主题数据 | `new_api_theme_v3` |
| 分组数据 | `new_api_groups_v3` |
| 运行日志 | `new_api_runtime_logs_v1`，最多保留最近 30 条 |

## 维护说明

### 新增设置项

1. 在 `www/js/state.js` 的 `AppState.settings` 增加默认值。
2. 在 `www/js/utils.js` 的 `ensureRuntimeState()` 里补默认值，兼容旧数据。
3. 在 `www/index.html` 增加设置 UI。
4. 在 `www/js/ui.js` 的 `cacheElements()` 中缓存元素 ID。
5. 在 `www/js/main.js` 或独立功能文件中绑定事件并调用 `saveSettings()`。

### 新增弹窗功能

1. 在 `www/index.html` 增加 `.modal-mask` 结构。
2. 在 `www/js/ui.js` 缓存弹窗相关 ID。
3. 在 `www/js/utils.js` 的 `closeAllModals()` 中加入弹窗 ID。
4. Android 返回键如需关闭该弹窗，也要在 `www/js/app.js` 的弹窗列表中加入 ID。
5. 复杂功能建议单独放在 `www/js/<feature>.js`，并在 `index.html` 中于 `main.js` 后引入。

### 样式约定

- 使用 CSS 变量：`--bg`、`--surface`、`--panel`、`--border`、`--text`、`--primary` 等。
- 复用现有按钮类：`primary-btn`、`ghost-btn`、`small-btn`、`danger-btn`。
- 移动端布局优先，避免固定大宽度。
- 文本可能很长的位置需要加：

```css
min-width: 0;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
```

### 代码注释约定

- 只保留功能提示类注释。
- 不写流水账注释，例如“点击按钮”“设置变量”等。
- 新功能模块顶部可以保留一行功能名称注释。
- 复杂兼容逻辑可保留必要说明。


## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v3.0.6 | 2026-06-20 | 新增令牌查询功能、堆叠柱状图优化、URL 默认隐藏、模型调用记录表、图例点击划线隐藏、修复关于页版本显示 |
| v3.0.5 | - | 优化与修复 |
| v3.0.4 | - | 优化与修复 |
| v3.0.3 | - | GitHub 最新成品版本 |

## 打包步骤

### 环境准备

1. 安装 Node.js。
2. 安装 Java JDK 17。
3. 安装 Android SDK（API 34）。
4. 配置 `ANDROID_HOME` 环境变量。

### 安装依赖并打包

```bash
cd new-api-android
npm install
cordova platform add android@13.0.0
cordova plugin add cordova-plugin-statusbar cordova-plugin-file cordova-plugin-advanced-http cordova-plugin-clipboard cordova-plugin-device cordova-plugin-android-permissions

# 调试包
cordova build android --debug

# 发布包，需要签名
cordova build android --release
```

APK 输出路径：

```text
platforms/android/app/build/outputs/apk/
```

### 同步前端资源

正常使用：

```bash
cordova prepare android
```

无法使用 Cordova 命令时，可手动同步：

```bash
cp -r www/* platforms/android/app/src/main/assets/www/
```
