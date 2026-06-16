# ApiKey Assistant

基于 [new-api](https://github.com/QuantumNous/new-api) 数据模型的 Android 移动端 API Key 渠道管理工具，使用 Cordova 构建。

## 项目结构

```
ApiKey-Assistant/
├── config.xml          # Cordova 配置（Android 平台、插件、权限）
├── package.json        # npm 依赖与构建脚本
├── res/                # Android 图标与启动画面资源
│   ├── icon/android/   # 应用图标 (ldpi ~ xxxhdpi)
│   └── screen/android/ # 启动画面 (横屏/竖屏)
├── hooks/              # Cordova 构建钩子（可扩展）
├── merges/             # 平台合并覆盖文件
└── www/                # 前端源码
    ├── index.html      # 主页面（Cordova 入口）
    ├── css/style.css   # 全局样式（支持深色/浅色主题）
    ├── img/            # 背景图与应用图标
    └── js/
        ├── state.js    # 渠道类型常量、全局状态与存储键名
        ├── utils.js    # 渠道数据标准化、存储读写、工具函数
        ├── api.js      # HTTP 适配器、模型获取、渠道测试
        ├── ui.js       # 卡片渲染、弹窗、主题切换
        ├── main.js     # 事件绑定、用户交互与业务逻辑
        └── app.js      # Android 生命周期（deviceready、返回键、状态栏）
```

## 功能

- **渠道管理** — 新增、编辑、删除、启用/禁用，完全对齐 new-api 的 Channel 模型
- **多类型支持** — 内置 58 种渠道类型（OpenAI、Anthropic、Gemini、DeepSeek、SiliconFlow 等），其余走 OpenAI 兼容协议
- **渠道分组** — Group 管理，可按分组筛选
- **多 Key 轮询** — 支持单 Key、轮询、随机三种模式
- **模型管理** — 手动添加/批量获取模型列表，模型映射 (Model Mapping) 可视化编辑
- **渠道测试** — 选定 Key 与模型后实时测试 API 可用性
- **批量操作** — 全选/批量启用/禁用/获取模型/删除
- **搜索排序** — 按关键词搜索、按优先级/权重/响应时间/名称排序
- **导入导出** — JSON 格式导入导出，支持剪贴板
- **主题切换** — 深色 / 浅色 / 跟随系统

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
npx cordova plugin add cordova-plugin-statusbar cordova-plugin-file cordova-plugin-advanced-http cordova-plugin-clipboard cordova-plugin-device cordova-plugin-android-permissions

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

## 数据存储

- 前端使用 `localStorage` 持久化，键名 `new_api_channels_v3`
- 导出文件默认保存到 `/storage/emulated/0/Download/ApiKey-Assistant/`

## 许可证

MIT License
