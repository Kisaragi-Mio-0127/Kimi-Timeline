/**
 * Kimi-Timeline - Popup Script
 * 处理弹出窗口的交互逻辑
 */

// 初始化
async function init() {
  await loadSettings();
  setupEventListeners();
  updateUI();
}

// 加载设置
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response.success) {
      window.settings = response.data;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    window.settings = {};
  }
}

// 设置事件监听器
function setupEventListeners() {
  // 快捷操作按钮
  document.getElementById('btn-export').addEventListener('click', () => {
    openExportDialog();
  });
  
  document.getElementById('btn-prompts').addEventListener('click', () => {
    openPromptLibrary();
  });
  
  document.getElementById('btn-folders').addEventListener('click', () => {
    openFolderManager();
  });
  
  // 功能开关
  document.getElementById('toggle-folders').addEventListener('change', (e) => {
    toggleFeature('folderManagement', e.target.checked);
  });
  
  document.getElementById('toggle-timeline').addEventListener('change', (e) => {
    toggleFeature('timeline', e.target.checked);
  });
  
  document.getElementById('toggle-prompts').addEventListener('change', (e) => {
    toggleFeature('promptLibrary', e.target.checked);
  });
  
  document.getElementById('toggle-export').addEventListener('change', (e) => {
    toggleFeature('export', e.target.checked);
  });
  
  // 视觉效果选择
  document.querySelectorAll('.effect-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const effect = btn.dataset.effect;
      selectVisualEffect(effect);
    });
  });
  
  // 底部按钮
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
  
  document.getElementById('btn-help').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/Kisaragi-Mio-0127/Kimi-Timeline/#readme' });
    window.close();
  });
}

// 更新 UI 状态
function updateUI() {
  const settings = window.settings || {};
  
  // 更新开关状态
  document.getElementById('toggle-folders').checked = settings.enableFolderManagement !== false;
  document.getElementById('toggle-timeline').checked = settings.enableTimeline !== false;
  document.getElementById('toggle-prompts').checked = settings.enablePromptLibrary !== false;
  document.getElementById('toggle-export').checked = settings.enableExport !== false;
  
  // 更新视觉效果选择
  const currentEffect = settings.visualEffect || 'none';
  document.querySelectorAll('.effect-btn').forEach(btn => {
    if (btn.dataset.effect === currentEffect) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// 获取 Kimi 标签页（支持 kimi.moonshot.cn 和 kimi.com）
async function getKimiTabs() {
  const tabs1 = await chrome.tabs.query({ url: 'https://kimi.moonshot.cn/*' });
  const tabs2 = await chrome.tabs.query({ url: 'https://kimi.com/*' });
  const tabs3 = await chrome.tabs.query({ url: 'https://www.kimi.com/*' });
  return [...tabs1, ...tabs2, ...tabs3];
}

// 切换功能
async function toggleFeature(feature, enabled) {
  try {
    // 保存设置
    const settingKey = `enable${feature.charAt(0).toUpperCase() + feature.slice(1)}`;
    await chrome.runtime.sendMessage({ 
      action: 'saveSettings', 
      data: { [settingKey]: enabled }
    });
    
    // 通知内容脚本
    const tabs = await getKimiTabs();
    if (tabs.length > 0) {
      await chrome.tabs.sendMessage(tabs[0].id, {
        action: 'toggleFeature',
        feature,
        enabled
      });
    }
    
    // 显示提示
    showNotification(`${enabled ? '已启用' : '已禁用'} ${getFeatureName(feature)}`);
  } catch (error) {
    console.error('Toggle feature error:', error);
    showNotification('操作失败', 'error');
  }
}

// 获取功能名称
function getFeatureName(feature) {
  const names = {
    folderManagement: '文件夹管理',
    timeline: '时间轴导航',
    promptLibrary: '提示词库',
    export: '聊天导出'
  };
  return names[feature] || feature;
}

// 选择视觉效果
async function selectVisualEffect(effect) {
  try {
    // 更新 UI
    document.querySelectorAll('.effect-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.effect === effect);
    });
    
    // 保存设置
    await chrome.runtime.sendMessage({ 
      action: 'saveSettings', 
      data: { 
        enableVisualEffects: effect !== 'none',
        visualEffect: effect 
      }
    });
    
    // 通知内容脚本（支持所有 Kimi 域名）
    const tabs = await getKimiTabs();
    if (tabs.length > 0) {
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'applyVisualEffect',
            effect
          });
        } catch (e) {
          // 忽略未响应的标签页
        }
      }
    }
    
    showNotification(`视觉效果已切换: ${effect === 'none' ? '无' : effect === 'snow' ? '雪花' : effect === 'sakura' ? '樱花' : '雨滴'}`);
  } catch (error) {
    console.error('Select effect error:', error);
    showNotification('切换失败，请确保在 Kimi 页面', 'error');
  }
}

// 打开导出对话框
async function openExportDialog() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url || '';
    if (!url.includes('kimi.moonshot.cn') && !url.includes('kimi.com')) {
      showNotification('请先在 Kimi 页面打开对话', 'error');
      return;
    }
    
    // 发送消息到内容脚本获取对话数据
    const response = await chrome.tabs.sendMessage(tabs[0].id, {
      action: 'getConversationData'
    });
    
    if (response.success && response.data) {
      // 创建导出对话框
      const formats = [
        { id: 'json', name: 'JSON', icon: '📄' },
        { id: 'markdown', name: 'Markdown', icon: '📝' },
        { id: 'html', name: 'HTML', icon: '🌐' }
      ];
      
      const formatHtml = formats.map(f => `
        <button class="export-format-btn" data-format="${f.id}">
          <span class="format-icon">${f.icon}</span>
          <span>${f.name}</span>
        </button>
      `).join('');
      
      const dialog = document.createElement('div');
      dialog.className = 'export-dialog';
      dialog.innerHTML = `
        <div class="dialog-overlay"></div>
        <div class="dialog-content">
          <h3>导出对话</h3>
          <p>选择导出格式：</p>
          <div class="format-list">
            ${formatHtml}
          </div>
          <button class="dialog-close">取消</button>
        </div>
      `;
      
      document.body.appendChild(dialog);
      
      // 添加样式
      const style = document.createElement('style');
      style.textContent = `
        .export-dialog {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
        }
        .dialog-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
        }
        .dialog-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 24px;
          border-radius: 16px;
          width: 90%;
          max-width: 320px;
        }
        .dialog-content h3 {
          margin: 0 0 16px 0;
          font-size: 18px;
        }
        .format-list {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin: 16px 0;
        }
        .export-format-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        .export-format-btn:hover {
          border-color: #4f46e5;
          background: #f5f3ff;
        }
        .format-icon {
          font-size: 24px;
        }
        .dialog-close {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 8px;
          background: #f3f4f6;
          color: #374151;
          font-size: 14px;
          cursor: pointer;
          margin-top: 8px;
        }
      `;
      document.head.appendChild(style);
      
      // 事件处理
      dialog.querySelector('.dialog-close').addEventListener('click', () => {
        dialog.remove();
        style.remove();
      });
      
      dialog.querySelectorAll('.export-format-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const format = btn.dataset.format;
          dialog.remove();
          style.remove();
          
          // 执行导出
          await chrome.runtime.sendMessage({
            action: 'exportData',
            format,
            data: { conversations: [response.data] }
          });
          
          showNotification('导出成功！');
          window.close();
        });
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    showNotification('导出失败，请确保在 Kimi 对话页面', 'error');
  }
}

// 打开提示词库
async function openPromptLibrary() {
  const tabs = await getKimiTabs();
  if (tabs.length > 0) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'openPromptLibrary' });
    window.close();
  } else {
    showNotification('请先打开 Kimi 页面', 'error');
  }
}

// 打开文件夹管理
async function openFolderManager() {
  const tabs = await getKimiTabs();
  if (tabs.length > 0) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'openFolderManager' });
    window.close();
  } else {
    showNotification('请先打开 Kimi 页面', 'error');
  }
}

// 显示通知
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 8px;
    background: ${type === 'error' ? '#ef4444' : '#10b981'};
    color: white;
    font-size: 14px;
    z-index: 10001;
    animation: fadeInUp 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'fadeOutDown 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// 初始化
document.addEventListener('DOMContentLoaded', init);
