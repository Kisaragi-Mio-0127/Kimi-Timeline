# 修改说明 (Modifications)

本项目 **Kimi-Timeline** 基于 [Kimi Voyager](https://github.com/ConfusedTraveler/kimi-voyager) 进行深度定制与重构。

原始项目版权：`Copyright (C) 2024 Kimi Voyager Contributors`

---

## 一、项目结构变更

### 删除的文件/目录
| 文件/目录 | 说明 |
|---|---|
| `.github/` | 移除 GitHub Actions、Issue 模板等 CI/CD 配置 |
| `docs/assets/logo.png` | 移除原始项目 Logo |
| `package.json` / `package-lock.json` | 移除 npm 依赖管理，改为无构建工具的直接加载方式 |
| `vite.config.base.ts` / `vite.config.chrome.ts` / `vite.config.firefox.ts` | 移除 Vite 构建配置 |
| `src/content/content.js` | 替换为合并后的 `content-v2.js` |

### 新增的文件
| 文件 | 说明 |
|---|---|
| `src/content/content-v2.js` | 核心内容脚本（~4500 行），合并了 Timeline、FolderManager、ExportManager、VisualEffects、HiddenHistory 等全部功能 |
| `src/content/features/hiddenHistory.js` | 新增"隐藏历史"功能模块（侧边栏底部显示未在列表中的历史对话） |

---

## 二、核心功能修改

### 1. 文件夹管理 (FolderManager)
- **重构为纯前端实现**：不再依赖 Vite 构建，直接作为 IIFE 内联类运行
- **新增隐藏历史面板**：在文件夹列表下方自动展示未显示的历史对话，支持拖拽收藏
- **新增导入/导出菜单**：点击"我的文件夹"标题栏 ⋮ 按钮，可直接导入/导出 JSON
- **新增网络拦截器**：自动拦截 Kimi API 响应，实时补充对话数据
- **新增全局长按拖拽**：支持在页面任意对话条目上长按鼠标直接拖拽到文件夹
- **新增页面原生菜单注入**：右键 Kimi 侧边栏对话时，自动注入"⭐ 添加到文件夹"选项
- **修复重复渲染问题**：`renderFolders()` 添加并发锁，防止异步竞争导致"暂无文件夹"重复显示

### 2. 对话时间轴 (Timeline)
- **重写激活逻辑**：修复点击时间轴节点后高亮跳回上一个的问题
  - 原因：`scrollIntoView({ block: 'center' })` 触发的平滑滚动期间，`updateCurrentIndex()` 错误覆盖索引
  - 修复：导航滚动期间（600ms）跳过 `updateCurrentIndex` 的索引更新
- **新增导航锁**：`_isNavigating` 防止滚动动画期间高亮被覆盖
- **适配新页面结构**：使用多种 fallback 选择器（`.chat-content-item`、`[class*="chat-content-item"]`、`[data-testid="conversation-turn"]` 等）适配 2025 年 Kimi 页面 DOM 结构

### 3. 导出功能 (ExportManager)
- 简化导出流程，移除 PDF 导出支持（保留 JSON / Markdown / HTML）
- **适配新页面结构**：使用轮询 + 多种 header 选择器（`[data-testid="chat-header"]`、`.chat-header`、`header` 等）动态插入导出按钮
- **导出文件名前缀**：`kimi-voyager-export-*` → `kimi-timeline-export-*`

### 4. 提示词库 (PromptLibrary)
- **功能隐藏**：popup 面板、options 设置页、background 右键菜单中的提示词库入口已全部移除
- README 中提示词库改为"后续实现"章节

### 5. 视觉特效 (VisualEffects)
- 代码结构优化，适配无构建环境

### 6. 隐藏历史 (HiddenHistory) —— 新增功能
- 在侧边栏"所有对话"折叠面板中展示未在首页列表显示的历史对话
- 支持从页面 HTML、localStorage、Kimi API（`apiv2/kimi.chat.v1.ChatService/ListChats`）多渠道获取完整历史
- 支持点击打开对话、拖拽收藏到文件夹

---

## 三、配置与界面修改

### `manifest.json`
- `name`: `Kimi Voyager` → `Kimi-Timeline`
- `version`: 更新为 `1.1.0`
- `description`: 移除 `prompt library` 相关描述
- `default_title`: 同步更新为 `Kimi-Timeline`
- `permissions`: 新增 `cookies` 权限（用于读取登录态、调用 API）
- `host_permissions` / `content_scripts.matches`:
  - 原始项目仅支持 `https://kimi.moonshot.cn/*`
  - 新项目新增支持 `https://kimi.com/*`、`https://www.kimi.com/*`、`https://www.kimi.moonshot.cn/*`

### `popup.html` / `popup.js`
- 移除"提示词库"快捷按钮（`#btn-prompts`）
- 移除"提示词库"功能开关（`#toggle-prompts`）
- 修复 `document.getElementById('btn-prompts')` 为 `null` 导致的 `TypeError`
- **新增 `getKimiTabs()` 函数**：同时查询 `kimi.moonshot.cn`、`kimi.com`、`www.kimi.com` 三个域名的标签页
- GitHub 链接更新为真实项目地址

### `options.html` / `options.js`
- 移除"提示词库"导航标签页及对应设置页面（HTML 中删除 `#prompts` section）
- 品牌名、版本号同步更新
- GitHub 链接更新为真实项目地址
- 导出文件名前缀：`kimi-voyager-folders-*` / `kimi-voyager-prompts-*` → `kimi-timeline-folders-*` / `kimi-timeline-prompts-*`

### `_locales/zh_CN/messages.json`
- 品牌名更新为 `Kimi-Timeline`
- 扩展描述更新（移除"提示词库"，增加"对话时间轴"）

### `src/background/background.js`
- 移除"保存到提示词库"右键菜单项 (`saveToPromptLibrary`)
- `documentUrlPatterns` 扩展为同时支持 `kimi.moonshot.cn` 和 `kimi.com` 域名
- 品牌名、导出文件名前缀更新
- **新增 `fetchHistoryPage` 消息处理器**：用于在后台通过 `fetch` 获取历史页面 HTML，支持带完整浏览器 User-Agent 和 Cookie 的请求

---

## 四、文档与法律信息

### `README.md`
- 完全重写，精简为中文文档
- 更新项目结构说明（`kimi-timeline-extension/`）
- 新增"后续实现"章节（提示词库）
- 保留上游项目致谢（kimi-voyager / gemini-voyager / AITimeline）
- **作者信息改为链接格式**

### `LICENSE`
- 保留原始项目版权声明：
  > `Copyright (C) 2024 Kimi Voyager Contributors`
- 新增本项目版权声明：
  > `Copyright (C) 2026 Kisaragi-Mio-0127`

---

## 五、已知问题修复记录

| 问题 | 修复位置 |
|---|---|
| 时间轴点击高亮跳回上一个 | `content-v2.js` Timeline.navigateToMessage() |
| 文件夹列表显示两个"暂无文件夹" | `content-v2.js` FolderManager.renderFolders() 添加并发锁 |
| ⋮ 菜单被注入"添加到文件夹" | `content-v2.js` MutationObserver / injectMenuOption 增加 `.kimi-voyager-folder-menu` 过滤 |
| popup.js TypeError (null addEventListener) | `popup.js` 移除已不存在的 DOM 元素绑定 |
| 请求失败时重复发送请求 | `content-v2.js` fetch hook 中修复：`throw e` 替代二次请求 |
| XHR 重复添加 load 监听器 | `content-v2.js` XMLHttpRequest hook 增加 `_voyagerLoadHooked` 标记 |
