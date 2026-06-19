# ApiKey Assistant

基于 [new-api](https://github.com/QuantumNous/new-api) 数据模型的 Android 移动端 API Key 渠道管理工具，使用 Cordova 构建。

## 项目结构

```
ApiKey-Assistant/
├── config.xml          # Cordova 配置（Android 平台、插件、权限）
├── package.json        # npm 依赖与构建脚本
├── res/                # Android 图标与启动画面资源
│   ├── icon/android/   # 应用图标（ldpi ~ xxxhdpi）
│   └── screen/android/ # 启动画面（横屏/竖屏）
├── hooks/              # Cordova 构建钩子（可扩展）
├── merges/             # 平台合并覆盖文件
└── www/                # 前端源码
    ├── index.html      # 主页面（Cordova 入口，全部弹窗结构）
    ├── css/style.css   # 全局样式（深色/浅色主题、毛玻璃、移动端适配）
    ├── img/            # 背景图与应用图标
    └── js/
        ├── state.js    # 渠道类型常量（58 种）、全局状态、存储键名
        ├── utils.js    # 渠道数据标准化、存储读写、剪贴板、日志等工具
        ├── api.js      # HTTP 适配器、CORS 代理、模型获取、渠道测试
        ├── ui.js       # 卡片渲染、各弹窗 UI、主题切换、搜索渲染
        ├── main.js     # 初始化、事件绑定、业务操作（CRUD、批量、分组管理）
        ├── newapi.js   # NewAPI 模型命名工具（模型后缀重命名 + 重定向 JSON 生成）
        └── app.js      # Android 生命周期（deviceready、返回键处理、状态栏控制）
```

## 功能

- **渠道管理** — 新增、编辑、删除、复制配置、启用/禁用，完全对齐 new-api 的 Channel 模型
- **多类型支持** — 内置 58 种渠道类型（OpenAI、Anthropic、Gemini、DeepSeek、SiliconFlow 等），其余走 OpenAI 兼容协议
- **渠道分组** — Group 管理，支持按分组筛选、批量移动分组
- **多 Key 管理** — 支持单 Key、轮询、随机三种模式，自动禁用异常 Key
- **模型管理** — 手动添加/批量获取模型列表，模型映射（Model Mapping）可视化编辑
- **NewAPI 模型命名工具** — 模型后缀重命名与重定向 JSON 生成（设置中开启）
- **渠道测试** — 选定 Key 与模型后实时测试 API 可用性，记录响应时间
- **批量操作** — 全选、批量启用/禁用/获取模型/删除/移动分组
- **搜索排序** — 按关键词搜索名称/URL/服务商/模型，按优先级/权重/响应时间/名称排序
- **导入导出** — JSON 格式导入导出，支持剪贴板读取
- **主题切换** — 深色、浅色、跟随系统
- **本地代理检测** — 自动检测代理状态与延迟

## 快速开始

### 环境要求

| 工具 | 版本要求 |
|------|---------|
| Node.js | >= 18 |
| Java JDK | 17 |
| Android SDK | API 34 |
| Gradle | 随 Android SDK |

### 安装与构建

```bash
git clone https://github.com/Mina-kk/ApiKey-Assistant.git
cd ApiKey-Assistant

npm install
npx cordova platform add android@13.0.0
npx cordova plugin add \
  cordova-plugin-statusbar \
  cordova-plugin-file \
  cordova-plugin-advanced-http \
  cordova-plugin-clipboard \
  cordova-plugin-device \
  cordova-plugin-android-permissions

npx cordova build android --debug
npx cordova build android --release
```

APK 输出：`platforms/android/app/build/outputs/apk/`

### 快捷脚本

```bash
npm run build          # 构建 release APK
npm run build-debug    # 构建 debug APK
npm run clean          # 清理构建缓存
```

### 同步前端资源

```bash
cordova prepare android
```

## 数据存储

使用 `localStorage` 持久化：

| 类型 | Key |
|------|-----|
| 渠道数据 | `new_api_channels_v3` |
| 设置数据 | `new_api_settings_v3` |
| 主题数据 | `new_api_theme_v3` |
| 分组数据 | `new_api_groups_v3` |
| 运行日志 | `new_api_runtime_logs_v1` |

导出文件默认保存到 `/storage/emulated/0/Download/ApiKey-Assistant/`

## 维护说明

### 新增设置项

1. 在 `www/js/state.js` 的 `AppState.settings` 增加默认值
2. 在 `www/js/utils.js` 的 `ensureRuntimeState()` 里补默认值兼容旧数据
3. 在 `www/index.html` 增加设置 UI
4. 在 `www/js/ui.js` 的 `cacheElements()` 中缓存元素 ID
5. 在 `www/js/main.js` 中绑定事件并调用 `saveSettings()`

### 新增弹窗功能

1. 在 `www/index.html` 增加 `.modal-mask` 结构
2. 在 `www/js/ui.js` 缓存弹窗相关 ID
3. 在 `www/js/utils.js` 的 `closeAllModals()` 中加入弹窗 ID
4. Android 返回键如需关闭该弹窗，在 `www/js/app.js` 的弹窗列表中加入 ID
5. 复杂功能单独放在 `www/js/<feature>.js`，并在 `index.html` 中于 `main.js` 后引入

## 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| **v3.0.42** | 2026-06-14 | 更新弹窗增加自动关闭倒计时（10s），替代 confirm 对话框；静默检查发现更新时自动弹出弹窗；提示文字增加代理/加速器建议 |
| **v3.0.2** | 2026-06-14 | 渠道测试改为直连模式，移除 logNetwork 参数签名；运行日志精简为最近 30 条并启用白名单过滤 |
| **v3.0.1** | 2026-06-19 | 新增 NewAPI 模型命名工具（newapi.js）、批量移动分组、分组选择器联动刷新 |
| **v3.0.0** | 2026-06-16 | 首个正式发布：58 种渠道类型、分组管理、多 Key 轮询、模型映射、渠道测试、批量操作、主题切换 |

## 许可证

MIT License
