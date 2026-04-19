/**
 * Kimi Voyager - Background Service Worker
 * 处理扩展的后台任务、消息传递、存储管理
 */

import { StorageManager } from '../utils/storage.js';
import { MessageHandler } from '../utils/messaging.js';

// 初始化存储管理器
const storageManager = new StorageManager();
const messageHandler = new MessageHandler();

// 扩展安装时的初始化
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Kimi Voyager installed:', details.reason);
  
  if (details.reason === 'install') {
    // 首次安装，初始化默认设置
    initializeDefaultSettings();
    // 打开欢迎页面
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/options/options.html?welcome=true')
    });
  } else if (details.reason === 'update') {
    // 更新时的处理
    console.log('Kimi Voyager updated to version', chrome.runtime.getManifest().version);
  }
  
  // 创建右键菜单
  createContextMenus();
});

// 初始化默认设置
async function initializeDefaultSettings() {
  const defaultSettings = {
    folders: [],
    prompts: [],
    settings: {
      enableFolderManagement: true,
      enableTimeline: true,
      enablePromptLibrary: true,
      enableExport: true,
      enableVisualEffects: false,
      visualEffect: 'none', // none, snow, sakura, rain
      theme: 'auto', // auto, light, dark
      language: 'zh-CN'
    }
  };
  
  await storageManager.set(defaultSettings);
}

// 创建右键菜单
function createContextMenus() {
  const urlPatterns = [
    'https://kimi.moonshot.cn/*',
    'https://www.kimi.moonshot.cn/*',
    'https://kimi.com/*',
    'https://www.kimi.com/*'
  ];
  
  chrome.contextMenus.create({
    id: 'saveToPromptLibrary',
    title: '保存到提示词库',
    contexts: ['selection'],
    documentUrlPatterns: urlPatterns
  });
  
  chrome.contextMenus.create({
    id: 'exportConversation',
    title: '导出当前对话',
    contexts: ['page'],
    documentUrlPatterns: urlPatterns
  });
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'saveToPromptLibrary':
      if (info.selectionText) {
        savePrompt(info.selectionText);
      }
      break;
    case 'exportConversation':
      chrome.tabs.sendMessage(tab.id, { action: 'exportConversation' });
      break;
  }
});

// 保存提示词
async function savePrompt(text) {
  const prompts = await storageManager.get('prompts') || [];
  prompts.push({
    id: Date.now().toString(),
    title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
    content: text,
    createdAt: Date.now(),
    tags: []
  });
  await storageManager.set({ prompts });
}

// 处理来自内容脚本和弹出窗口的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // 保持消息通道开放以支持异步响应
});

// 消息处理函数
async function handleMessage(request, sender, sendResponse) {
  try {
    switch (request.action) {
      case 'getFolders':
        const folders = await storageManager.get('folders') || [];
        sendResponse({ success: true, data: folders });
        break;
        
      case 'saveFolders':
        await storageManager.set({ folders: request.data });
        sendResponse({ success: true });
        break;
        
      case 'getPrompts':
        const prompts = await storageManager.get('prompts') || [];
        sendResponse({ success: true, data: prompts });
        break;
        
      case 'savePrompts':
        await storageManager.set({ prompts: request.data });
        sendResponse({ success: true });
        break;
        
      case 'getSettings':
        const settings = await storageManager.get('settings') || {};
        sendResponse({ success: true, data: settings });
        break;
        
      case 'saveSettings':
        await storageManager.set({ settings: { ...await storageManager.get('settings'), ...request.data } });
        sendResponse({ success: true });
        break;
        
      case 'exportData':
        handleExport(request.format, request.data, sendResponse);
        break;
        
      case 'openOptions':
        chrome.runtime.openOptionsPage();
        sendResponse({ success: true });
        break;

      case 'fetchHistoryPage':
        console.log('[Background] fetchHistoryPage 收到请求:', request.url);
        try {
          // 尝试带上完整的浏览器 User-Agent，模拟真实浏览器导航请求
          const resp = await fetch(request.url, {
            credentials: 'include',
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Referer': request.url,
              'User-Agent': navigator.userAgent,
              'Upgrade-Insecure-Requests': '1'
            }
          });
          console.log('[Background] fetch 状态:', resp.status);
          if (!resp.ok) {
            sendResponse({ success: false, error: `HTTP ${resp.status}` });
          } else {
            const html = await resp.text();
            const hasData = html.includes('data-conv-id') || html.includes('history-link') || /\/chat\/[a-zA-Z0-9-]{10,40}/.test(html);
            console.log('[Background] fetch 成功，HTML 大小:', html.length, '包含对话数据:', hasData);
            sendResponse({ success: true, html });
          }
        } catch (fetchErr) {
          console.log('[Background] fetch 异常:', fetchErr.message);
          sendResponse({ success: false, error: fetchErr.message });
        }
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Background script error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 处理导出功能
function handleExport(format, data, sendResponse) {
  let blob, filename;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  switch (format) {
    case 'json':
      blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      filename = `kimi-voyager-export-${timestamp}.json`;
      break;
      
    case 'markdown':
      const markdown = convertToMarkdown(data);
      blob = new Blob([markdown], { type: 'text/markdown' });
      filename = `kimi-voyager-export-${timestamp}.md`;
      break;
      
    case 'html':
      const html = convertToHTML(data);
      blob = new Blob([html], { type: 'text/html' });
      filename = `kimi-voyager-export-${timestamp}.html`;
      break;
      
    default:
      sendResponse({ success: false, error: 'Unsupported format' });
      return;
  }
  
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true, downloadId });
    }
    URL.revokeObjectURL(url);
  });
}

// 转换为 Markdown 格式
function convertToMarkdown(data) {
  let md = `# Kimi Voyager 导出\n\n`;
  md += `导出时间: ${new Date().toLocaleString()}\n\n`;
  md += `---\n\n`;
  
  if (data.conversations) {
    data.conversations.forEach((conv, index) => {
      md += `## 对话 ${index + 1}: ${conv.title || '未命名'}\n\n`;
      conv.messages.forEach(msg => {
        md += `**${msg.role === 'user' ? '用户' : 'Kimi'}:**\n\n${msg.content}\n\n`;
      });
      md += `---\n\n`;
    });
  }
  
  return md;
}

// 转换为 HTML 格式
function convertToHTML(data) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kimi Voyager 导出</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; margin-bottom: 20px; }
    .conversation { margin-bottom: 30px; }
    .message { margin-bottom: 15px; padding: 15px; border-radius: 8px; }
    .user { background-color: #e3f2fd; }
    .assistant { background-color: #f5f5f5; }
    .role { font-weight: bold; margin-bottom: 5px; color: #333; }
    .content { line-height: 1.6; }
    .timestamp { color: #999; font-size: 12px; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Kimi Voyager 导出</h1>
    <p>导出时间: ${new Date().toLocaleString()}</p>
  </div>
  ${data.conversations ? data.conversations.map((conv, index) => `
    <div class="conversation">
      <h2>对话 ${index + 1}: ${conv.title || '未命名'}</h2>
      ${conv.messages.map(msg => `
        <div class="message ${msg.role}">
          <div class="role">${msg.role === 'user' ? '用户' : 'Kimi'}</div>
          <div class="content">${msg.content.replace(/\n/g, '<br>')}</div>
          ${msg.timestamp ? `<div class="timestamp">${new Date(msg.timestamp).toLocaleString()}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('') : ''}
</body>
</html>
  `;
}

// 监听标签页更新，注入内容脚本
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && 
      (tab.url?.includes('kimi.moonshot.cn') || tab.url?.includes('kimi.com'))) {
    // 可以在这里执行页面加载完成后的操作
    console.log('Kimi page loaded:', tab.url);
  }
});

console.log('Kimi Voyager background script loaded');
