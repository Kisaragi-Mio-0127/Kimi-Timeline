# Kimi-Timeline

<p align="center">
  <img src="kimi-timeline-extension/src/assets/icon128.png" alt="Kimi-Timeline Logo" width="128">
</p>

<p align="center">
  <strong>专为 Kimi AI 打造的浏览器增强扩展</strong>，集成文件夹管理、对话时间轴、聊天记录导出等实用功能，让你的 AI 对话体验更加高效、有序。
</p>

> 💡 本项目基于多个开源项目整合与深度定制，专门为 [Kimi AI](https://kimi.com) 用户提供原生级的侧边栏增强体验。

---

## ✨ 功能特性

### 📂 文件夹管理
- **无限层级文件夹**：支持文件夹嵌套子文件夹，自由组织对话结构
- **拖拽排序与移动**：文件夹内对话支持拖拽重新排序，跨文件夹拖拽移动
- **对话收藏**：长按侧边栏对话即可拖拽到文件夹
- **右键菜单**：文件夹支持重命名、更改颜色、添加子文件夹、删除；对话支持移除、打开
- **导入/导出**：支持将文件夹结构导出为 JSON 备份，或从 JSON 文件导入恢复
- **跨标签页同步**：基于 Chrome Storage，多标签页间文件夹数据实时同步

### 🕐 对话时间轴（Chat Timeline）
- 右侧可视化时间轴，一键跳转到任意对话位置
- 星标重要对话片段，快速定位历史消息

### 💾 聊天导出
- 一键导出当前对话为 Markdown 格式
- 保留对话结构和格式

### 🎨 个性化
- 多种视觉特效（雪花、樱花、雨滴）
- 深色/浅色主题适配

---

## 📦 安装

### 手动安装（开发者模式）

1. 克隆本仓库到本地
2. 打开 Chrome/Edge，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `kimi-timeline-extension` 文件夹

---

## 🚀 使用方法

### 文件夹管理
1. 访问 [kimi.com](https://kimi.com) 或任意对话页面
2. 在左侧侧边栏「📁 我的文件夹」区域点击 `⋮` 菜单可导入/导出文件夹
3. 点击 `+` 按钮创建新文件夹
4. **拖拽收藏**：在侧边栏对话条目上长按鼠标，即可拖拽到目标文件夹
5. **右键操作**：右键文件夹可重命名、改颜色、新建子文件夹或删除；右键对话可移除或打开

### 时间轴导航
- 进入任意对话后，右侧会出现时间轴面板
- 点击节点快速跳转到对应消息位置

### 导出对话
- 打开对话后，点击顶部「导出」按钮即可保存为 Markdown

---

## 🔮 后续实现

- **提示词库**：快捷保存和调用常用提示词（开发中）

---

## 🛠️ 开发

### 项目结构

```
kimi-timeline-extension/
├── manifest.json              # Chrome Extension Manifest V3
├── _locales/
│   └── zh_CN/
│       └── messages.json      # 中文本地化
├── src/
│   ├── assets/                # 扩展图标
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   ├── background/
│   │   └── background.js      # Service Worker：存储、导出、右键菜单
│   ├── content/
│   │   ├── content-v2.js      # 主内容脚本（核心逻辑入口）
│   │   └── features/          # 功能模块
│   │       ├── folderManager.js      # 文件夹管理
│   │       ├── timeline.js           # 对话时间轴
│   │       ├── exportManager.js      # 聊天记录导出
│   │       ├── hiddenHistory.js      # 隐藏历史对话
│   │       ├── visualEffects.js      # 视觉特效
│   │       └── promptLibrary.js      # 提示词库（预留）
│   ├── popup/
│   │   ├── popup.html         # 弹出面板
│   │   ├── popup.css
│   │   └── popup.js           # 快捷操作与功能开关
│   ├── options/
│   │   ├── options.html       # 设置页面
│   │   ├── options.css
│   │   └── options.js
│   ├── styles/
│   │   └── content.css        # 注入 Kimi 页面的全局样式
│   └── utils/
│       ├── dom.js             # DOM 工具函数
│       ├── messaging.js       # 消息通信封装
│       └── storage.js         # Chrome Storage 封装
└── README.md
```

### 本地开发

本项目为纯前端扩展，**无需构建工具**，直接修改源码后刷新扩展即可生效：

1. 修改 `src/` 目录下的任意文件（如 `content-v2.js`、`popup.js`、`background.js`、`options.js` 等）
2. 在 `chrome://extensions/` 中点击扩展的「刷新」按钮即可生效

> 提示：`content-v2.js` 是核心内容脚本，集成了文件夹管理、时间轴、导出、隐藏历史等全部功能；如需调整页面交互逻辑，通常只需修改此文件。

---

## 📚 项目来源与致谢

本项目在以下开源项目的基础上进行整合、重构与深度定制：

| 项目 | 作者 | 许可证 | 说明 |
|---|---|---|---|
| [kimi-voyager](https://github.com/ConfusedTraveler/kimi-voyager) | [@ConfusedTraveler](https://github.com/ConfusedTraveler) | **GPL-3.0** | 原始 Kimi Voyager 项目，提供文件夹管理基础框架 |
| [gemini-voyager](https://github.com/Nagi-ovo/gemini-voyager) | [@Nagi-ovo](https://github.com/Nagi-ovo) | **GPL-3.0** | 提供时间轴导航、对话导出、视觉特效等核心功能 |
| [AITimeline](https://github.com/houyanchao/Timeline) | [@houyanchao](https://github.com/houyanchao) | MIT | 提供多平台 AI 对话增强的设计思路与交互参考 |

> **特别说明**：由于上游项目 [kimi-voyager](https://github.com/ConfusedTraveler/kimi-voyager) 与 [gemini-voyager](https://github.com/Nagi-ovo/gemini-voyager) 均采用 **GPL-3.0** 许可证，根据 GPL 协议的传染性要求，本项目亦采用 **GPL-3.0** 许可证开源。

---

## 📄 许可证

本项目采用 **GNU General Public License v3.0 (GPL-3.0)** 开源。

> GPL-3.0 是一种 copyleft 开源许可证，要求任何分发本程序或其衍生作品的第三方，必须以相同的 GPL-3.0 许可证公开其源代码。详细信息请参阅 [LICENSE](./LICENSE) 文件或访问 [GNU GPL v3.0 官方页面](https://www.gnu.org/licenses/gpl-3.0.html)。

---

Made with ❤️ for Kimi AI users
