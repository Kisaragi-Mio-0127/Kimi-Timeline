/**
 * Kimi-Timeline - Options Page
 * 设置页面的交互逻辑
 */

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupNavigation();
  setupEventListeners();
  loadPrompts();
  
  // 显示版本号
  const manifest = chrome.runtime.getManifest();
  document.getElementById('version').textContent = `v${manifest.version}`;
});

// 加载设置
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response.success) {
      applySettings(response.data);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// 应用设置到表单
function applySettings(settings) {
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = value;
  };
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };

  setChecked('enable-folders', settings.enableFolderManagement !== false);
  setChecked('enable-timeline', settings.enableTimeline !== false);
  setChecked('enable-prompts', settings.enablePromptLibrary !== false);
  setChecked('enable-export', settings.enableExport !== false);
  setValue('theme', settings.theme || 'auto');
  setValue('visual-effect', settings.visualEffect || 'none');
  setChecked('default-include-timestamp', settings.defaultIncludeTimestamp !== false);
  setChecked('default-include-metadata', settings.defaultIncludeMetadata === true);

  // 应用主题到设置页面
  applyTheme(settings.theme || 'auto');
}

// 保存设置
async function saveSettings() {
  const settings = {
    enableFolderManagement: document.getElementById('enable-folders').checked,
    enableTimeline: document.getElementById('enable-timeline').checked,
    enablePromptLibrary: document.getElementById('enable-prompts').checked,
    enableExport: document.getElementById('enable-export').checked,
    theme: document.getElementById('theme').value,
    visualEffect: document.getElementById('visual-effect').value,
    defaultIncludeTimestamp: document.getElementById('default-include-timestamp').checked,
    defaultIncludeMetadata: document.getElementById('default-include-metadata').checked
  };

  try {
    await chrome.runtime.sendMessage({ action: 'saveSettings', data: settings });
    applyTheme(settings.theme);
    // 通知所有 Kimi 标签页设置已变更
    await notifyContentScripts(settings);
    showNotification('设置已保存');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showNotification('保存失败', 'error');
  }
}

// 通知内容脚本设置变更
async function notifyContentScripts(settings) {
  try {
    const tabs1 = await chrome.tabs.query({ url: 'https://kimi.moonshot.cn/*' });
    const tabs2 = await chrome.tabs.query({ url: 'https://kimi.com/*' });
    const tabs3 = await chrome.tabs.query({ url: 'https://www.kimi.com/*' });
    const tabs = [...tabs1, ...tabs2, ...tabs3];
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'settingsChanged', settings });
      } catch (e) {
        // 忽略未响应的标签页
      }
    }
  } catch (error) {
    console.error('Notify content scripts error:', error);
  }
}

// 应用主题到设置页面
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.dataset.theme = 'dark';
  } else if (theme === 'light') {
    root.dataset.theme = 'light';
  } else {
    delete root.dataset.theme;
  }
}

// 设置导航
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.section');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // 更新导航状态
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // 显示对应部分
      const targetId = item.getAttribute('href').slice(1);
      sections.forEach(section => {
        section.style.display = section.id === targetId ? 'block' : 'none';
      });
    });
  });
}

// 设置事件监听器
function setupEventListeners() {
  // 设置变更自动保存
  document.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', () => {
      saveSettings();
    });
  });

  // 导出文件夹
  document.getElementById('export-folders')?.addEventListener('click', exportFolders);
  
  // 导入文件夹
  document.getElementById('import-folders')?.addEventListener('click', () => {
    document.getElementById('import-folders-input').click();
  });
  
  document.getElementById('import-folders-input')?.addEventListener('change', importFolders);
  
  // 导出提示词
  document.getElementById('export-prompts')?.addEventListener('click', exportPrompts);
  
  // 导入提示词
  document.getElementById('import-prompts')?.addEventListener('click', () => {
    document.getElementById('import-prompts-input').click();
  });
  
  document.getElementById('import-prompts-input')?.addEventListener('change', importPrompts);
}

// 导出文件夹
async function exportFolders() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getFolders' });
    const folders = response.data || [];
    
    const blob = new Blob([JSON.stringify(folders, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `kimi-timeline-folders-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showNotification('文件夹已导出');
  } catch (error) {
    console.error('Export failed:', error);
    showNotification('导出失败', 'error');
  }
}

// 导入文件夹
async function importFolders(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const folders = JSON.parse(text);
    
    await chrome.runtime.sendMessage({ action: 'saveFolders', data: folders });
    showNotification('文件夹已导入');
  } catch (error) {
    console.error('Import failed:', error);
    showNotification('导入失败，请检查文件格式', 'error');
  }
  
  event.target.value = '';
}

// 导出提示词
async function exportPrompts() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getPrompts' });
    const prompts = response.data || [];
    
    const blob = new Blob([JSON.stringify(prompts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `kimi-timeline-prompts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showNotification('提示词已导出');
  } catch (error) {
    console.error('Export failed:', error);
    showNotification('导出失败', 'error');
  }
}

// 导入提示词
async function importPrompts(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const prompts = JSON.parse(text);
    
    await chrome.runtime.sendMessage({ action: 'savePrompts', data: prompts });
    showNotification('提示词已导入');
    loadPrompts();
  } catch (error) {
    console.error('Import failed:', error);
    showNotification('导入失败，请检查文件格式', 'error');
  }
  
  event.target.value = '';
}

// 加载提示词列表
async function loadPrompts() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getPrompts' });
    const prompts = response.data || [];
    
    const container = document.getElementById('prompt-list');
    if (!container) return;
    
    if (prompts.length === 0) {
      container.innerHTML = '<div class="prompt-item"><div class="prompt-item-info"><p>暂无提示词</p></div></div>';
      return;
    }
    
    container.innerHTML = prompts.map(prompt => `
      <div class="prompt-item">
        <div class="prompt-item-info">
          <h4>${escapeHtml(prompt.title)}</h4>
          <p>${escapeHtml(prompt.content.slice(0, 100))}${prompt.content.length > 100 ? '...' : ''}</p>
        </div>
        <div class="prompt-item-actions">
          <button class="btn btn-secondary" onclick="editPrompt('${prompt.id}')">编辑</button>
          <button class="btn btn-secondary" onclick="deletePrompt('${prompt.id}')">删除</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load prompts:', error);
  }
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 显示通知
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 14px 24px;
    border-radius: 10px;
    background: ${type === 'error' ? '#ef4444' : '#10b981'};
    color: white;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
