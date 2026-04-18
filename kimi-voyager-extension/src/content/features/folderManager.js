/**
 * Folder Manager - 文件夹管理功能
 * 提供对话的组织、分类和管理功能
 */

import { sendMessage } from '../../utils/messaging.js';
import { createElement, showToast, createModal } from '../../utils/dom.js';

export class FolderManager {
  constructor() {
    this.folders = [];
    this.container = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    
    console.log('📁 Initializing Folder Manager...');
    
    await this.loadFolders();
    this.createUI();
    this.injectStyles();
    this.setupDragAndDrop();
    
    this.isInitialized = true;
  }

  async loadFolders() {
    try {
      const response = await sendMessage('getFolders');
      this.folders = response.data || [];
    } catch (error) {
      console.error('Failed to load folders:', error);
      this.folders = [];
    }
  }

  async saveFolders() {
    try {
      await sendMessage('saveFolders', { data: this.folders });
    } catch (error) {
      console.error('Failed to save folders:', error);
    }
  }

  createUI() {
    // 查找 Kimi 的侧边栏（适配2025年页面结构）
    // 尝试多种选择器找到合适的位置
    let insertPoint = null;
    let insertMethod = 'before';
    
    // 尝试找到历史会话区域
    const selectors = [
      { selector: '.history-part', method: 'before' },
      { selector: '[class*="history"]', method: 'before' },
      { selector: '.sidebar', method: 'append' },
      { selector: '[class*="sidebar"]', method: 'append' },
      { selector: 'aside', method: 'append' },
      { selector: 'nav', method: 'append' }
    ];
    
    for (const { selector, method } of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        insertPoint = el;
        insertMethod = method;
        console.log(`📁 FolderManager: Found insert point with selector: ${selector}`);
        break;
      }
    }
    
    if (!insertPoint) {
      console.warn('📁 FolderManager: Could not find sidebar, will retry...');
      // 延迟重试
      setTimeout(() => this.createUI(), 2000);
      return;
    }

    // 创建 Voyager 文件夹容器
    this.container = createElement('div', {
      className: 'kimi-voyager-folders',
      children: [
        this.createHeader(),
        this.createFolderList()
      ]
    });

    // 插入到合适的位置
    if (insertMethod === 'before' && insertPoint.parentElement) {
      insertPoint.parentElement.insertBefore(this.container, insertPoint);
    } else {
      insertPoint.appendChild(this.container);
    }
    
    console.log('📁 FolderManager: UI created successfully');
  }

  createHeader() {
    return createElement('div', {
      className: 'kimi-voyager-folders-header',
      children: [
        createElement('span', {
          className: 'kimi-voyager-folders-title',
          text: '📁 我的文件夹'
        }),
        createElement('button', {
          className: 'kimi-voyager-folders-add-btn',
          text: '+',
          events: {
            click: () => this.showCreateFolderDialog()
          }
        })
      ]
    });
  }

  createFolderList() {
    const list = createElement('div', {
      className: 'kimi-voyager-folders-list'
    });

    if (this.folders.length === 0) {
      list.appendChild(createElement('div', {
        className: 'kimi-voyager-folders-empty',
        text: '暂无文件夹，点击 + 创建'
      }));
    } else {
      this.folders.forEach(folder => {
        list.appendChild(this.createFolderItem(folder));
      });
    }

    return list;
  }

  createFolderItem(folder) {
    const item = createElement('div', {
      className: 'kimi-voyager-folder-item',
      attributes: {
        'data-folder-id': folder.id,
        draggable: 'true'
      },
      events: {
        dragstart: (e) => this.handleDragStart(e, folder),
        dragover: (e) => this.handleDragOver(e),
        dragenter: (e) => this.handleDragEnter(e, item),
        dragleave: (e) => this.handleDragLeave(e, item),
        drop: (e) => this.handleDrop(e, folder, item),
        click: () => this.openFolder(folder)
      }
    });

    // 文件夹图标和名称
    const header = createElement('div', {
      className: 'kimi-voyager-folder-header',
      children: [
        createElement('span', {
          className: 'kimi-voyager-folder-icon',
          text: folder.icon || '📁',
          styles: { color: folder.color || '#4f46e5' }
        }),
        createElement('span', {
          className: 'kimi-voyager-folder-name',
          text: folder.name
        }),
        createElement('span', {
          className: 'kimi-voyager-folder-count',
          text: `(${folder.conversations?.length || 0})`
        }),
        this.createFolderActions(folder)
      ]
    });

    item.appendChild(header);

    // 子文件夹或对话列表
    if (folder.children?.length > 0 || folder.conversations?.length > 0) {
      const content = createElement('div', {
        className: 'kimi-voyager-folder-content',
        children: [
          ...folder.children?.map(child => this.createFolderItem(child)) || [],
          ...folder.conversations?.map(conv => this.createConversationItem(conv, folder)) || []
        ]
      });
      item.appendChild(content);
    }

    return item;
  }

  createConversationItem(conv, folder) {
    return createElement('div', {
      className: 'kimi-voyager-conversation-item',
      attributes: { 'data-conv-id': conv.id },
      events: {
        click: (e) => {
          e.stopPropagation();
          this.openConversation(conv);
        }
      },
      children: [
        createElement('span', { text: '💬 ' }),
        createElement('span', {
          className: 'kimi-voyager-conversation-title',
          text: conv.title || '未命名对话'
        })
      ]
    });
  }

  createFolderActions(folder) {
    return createElement('div', {
      className: 'kimi-voyager-folder-actions',
      children: [
        createElement('button', {
          className: 'kimi-voyager-folder-action-btn',
          text: '⋮',
          events: {
            click: (e) => {
              e.stopPropagation();
              this.showFolderMenu(e, folder);
            }
          }
        })
      ]
    });
  }

  showCreateFolderDialog(parentId = null) {
    const colors = [
      { name: '默认', value: '#4f46e5' },
      { name: '红色', value: '#ef4444' },
      { name: '橙色', value: '#f97316' },
      { name: '绿色', value: '#10b981' },
      { name: '蓝色', value: '#3b82f6' },
      { name: '紫色', value: '#8b5cf6' }
    ];

    const icons = ['📁', '📂', '🗂️', '📋', '📝', '🔖', '🏷️', '⭐'];

    let selectedColor = colors[0].value;
    let selectedIcon = icons[0];

    const modal = createModal({
      title: '创建文件夹',
      content: `
        <div class="kimi-voyager-form">
          <div class="form-group">
            <label>文件夹名称</label>
            <input type="text" id="folder-name" placeholder="输入文件夹名称" autofocus>
          </div>
          <div class="form-group">
            <label>图标</label>
            <div class="icon-selector">
              ${icons.map(icon => `
                <button class="icon-btn ${icon === selectedIcon ? 'selected' : ''}" data-icon="${icon}">${icon}</button>
              `).join('')}
            </div>
          </div>
          <div class="form-group">
            <label>颜色</label>
            <div class="color-selector">
              ${colors.map(color => `
                <button class="color-btn ${color.value === selectedColor ? 'selected' : ''}" 
                        data-color="${color.value}" 
                        style="background: ${color.value}"></button>
              `).join('')}
            </div>
          </div>
        </div>
      `,
      buttons: [
        { text: '取消', close: true },
        {
          text: '创建',
          primary: true,
          onClick: () => {
            const name = document.getElementById('folder-name').value.trim();
            if (name) {
              this.createFolder(name, selectedIcon, selectedColor, parentId);
            }
          }
        }
      ]
    });

    // 图标选择
    modal.element.querySelectorAll('.icon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.element.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedIcon = btn.dataset.icon;
      });
    });

    // 颜色选择
    modal.element.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.element.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedColor = btn.dataset.color;
      });
    });
  }

  async createFolder(name, icon, color, parentId = null) {
    const newFolder = {
      id: Date.now().toString(),
      name,
      icon,
      color,
      conversations: [],
      children: [],
      createdAt: Date.now()
    };

    if (parentId) {
      // 添加到子文件夹
      const parent = this.findFolder(parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(newFolder);
      }
    } else {
      this.folders.push(newFolder);
    }

    await this.saveFolders();
    this.refreshUI();
    showToast('文件夹创建成功！', 'success');
  }

  findFolder(id, folders = this.folders) {
    for (const folder of folders) {
      if (folder.id === id) return folder;
      if (folder.children) {
        const found = this.findFolder(id, folder.children);
        if (found) return found;
      }
    }
    return null;
  }

  showFolderMenu(event, folder) {
    // 移除现有的菜单
    document.querySelectorAll('.kimi-voyager-context-menu').forEach(m => m.remove());

    const menu = createElement('div', {
      className: 'kimi-voyager-context-menu',
      styles: {
        position: 'fixed',
        left: `${event.clientX}px`,
        top: `${event.clientY}px`,
        zIndex: '999999'
      },
      children: [
        this.createMenuItem('重命名', () => this.renameFolder(folder)),
        this.createMenuItem('更改颜色', () => this.changeFolderColor(folder)),
        this.createMenuItem('添加子文件夹', () => this.showCreateFolderDialog(folder.id)),
        this.createMenuItem('删除', () => this.deleteFolder(folder), true)
      ]
    });

    document.body.appendChild(menu);

    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  createMenuItem(label, onClick, isDanger = false) {
    return createElement('div', {
      className: `kimi-voyager-menu-item ${isDanger ? 'danger' : ''}`,
      text: label,
      events: { click: onClick }
    });
  }

  async renameFolder(folder) {
    const newName = prompt('输入新名称:', folder.name);
    if (newName && newName !== folder.name) {
      folder.name = newName;
      await this.saveFolders();
      this.refreshUI();
    }
  }

  async changeFolderColor(folder) {
    const colors = ['#4f46e5', '#ef4444', '#f97316', '#10b981', '#3b82f6', '#8b5cf6'];
    const color = colors.find(c => c !== folder.color) || colors[0];
    folder.color = color;
    await this.saveFolders();
    this.refreshUI();
  }

  async deleteFolder(folder) {
    if (confirm(`确定要删除文件夹 "${folder.name}" 吗？`)) {
      this.folders = this.folders.filter(f => f.id !== folder.id);
      await this.saveFolders();
      this.refreshUI();
      showToast('文件夹已删除', 'success');
    }
  }

  setupDragAndDrop() {
    // 使 Kimi 的对话列表项可拖拽（适配2025年页面结构）
    // 使用轮询而不是 MutationObserver 来避免性能问题
    let lastChatCount = 0;
    
    const makeItemsDraggable = () => {
      // 尝试多种选择器找到对话列表项
      const selectors = [
        '.sidebar-nav .chat-info-item',
        '.sidebar a[href*="/chat/"]',
        '[class*="sidebar"] a[href*="/chat/"]',
        'aside a[href*="/chat/"]',
        'nav a[href*="/chat/"]',
        '.history-part a',
        '[class*="history"] a'
      ];
      
      let chatItems = [];
      for (const selector of selectors) {
        chatItems = document.querySelectorAll(selector);
        if (chatItems.length > 0) {
          break;
        }
      }
      
      // 如果数量没有变化，跳过
      if (chatItems.length === lastChatCount) return;
      lastChatCount = chatItems.length;
      
      console.log(`📁 Drag&Drop: Making ${chatItems.length} items draggable`);
      
      chatItems.forEach(item => {
        if (item.dataset.voyagerDraggable === 'true') return;
        
        item.dataset.voyagerDraggable = 'true';
        item.draggable = true;
        
        // 获取聊天 ID 和名称
        const href = item.getAttribute('href') || '';
        const match = href.match(/\/chat\/([^/?#]+)/);
        const convId = match ? match[1] : '';
        
        // 尝试多种方式获取标题
        let title = '';
        const nameSelectors = ['.chat-name', '[class*="chat-name"]', '.title', '[class*="title"]'];
        for (const sel of nameSelectors) {
          const nameEl = item.querySelector(sel);
          if (nameEl) {
            title = nameEl.textContent.trim();
            break;
          }
        }
        if (!title) {
          title = item.textContent.trim().split('\n')[0] || convId;
        }
        
        // 存储数据到元素上
        item.dataset.convId = convId;
        item.dataset.convTitle = title;
        
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'conversation',
            id: convId,
            title
          }));
          e.dataTransfer.effectAllowed = 'move';
          item.style.opacity = '0.5';
          item.classList.add('dragging');
          console.log(`📁 Drag started: ${title}`);
        });
        
        item.addEventListener('dragend', () => {
          item.style.opacity = '1';
          item.classList.remove('dragging');
          console.log(`📁 Drag ended: ${title}`);
        });
      });
    };
    
    // 初始执行
    makeItemsDraggable();
    
    // 使用轮询检查新元素（每2秒）
    this.dragDropInterval = setInterval(makeItemsDraggable, 2000);
  }

  handleDragStart(e, folder) {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'folder',
      id: folder.id
    }));
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = '0.5';
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  handleDragEnter(e, item) {
    e.preventDefault();
    item.classList.add('drag-over');
  }

  handleDragLeave(e, item) {
    // 检查是否真的离开了元素（而不是进入了子元素）
    if (!item.contains(e.relatedTarget)) {
      item.classList.remove('drag-over');
    }
  }

  async handleDrop(e, targetFolder, item) {
    e.preventDefault();
    e.stopPropagation();
    
    item.classList.remove('drag-over');

    let data;
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
    } catch (err) {
      console.error('Failed to parse drag data:', err);
      return;
    }
    
    console.log('📁 Drop received:', data);
    
    if (data.type === 'conversation') {
      // 添加对话到文件夹
      if (!targetFolder.conversations) {
        targetFolder.conversations = [];
      }
      
      if (!targetFolder.conversations.find(c => c.id === data.id)) {
        targetFolder.conversations.push({
          id: data.id,
          title: data.title,
          addedAt: Date.now()
        });
        await this.saveFolders();
        this.refreshUI();
        showToast(`已添加 "${data.title}" 到文件夹`, 'success');
      } else {
        showToast('该对话已在文件夹中', 'info');
      }
    }
  }

  openFolder(folder) {
    // 展开/折叠文件夹
    const element = document.querySelector(`[data-folder-id="${folder.id}"]`);
    if (element) {
      element.classList.toggle('expanded');
    }
  }

  openConversation(conv) {
    // 导航到对话（适配2025年页面结构）
    const selectors = [
      `.sidebar-nav .chat-info-item[href*="${conv.id}"]`,
      `.sidebar a[href*="${conv.id}"]`,
      `[class*="sidebar"] a[href*="${conv.id}"]`,
      `a[href*="${conv.id}"]`
    ];
    
    for (const selector of selectors) {
      const convElement = document.querySelector(selector);
      if (convElement) {
        convElement.click();
        console.log(`📁 Navigated to conversation: ${conv.title}`);
        return;
      }
    }
    
    // 如果没找到元素，尝试直接导航
    if (conv.id) {
      window.location.href = `/chat/${conv.id}`;
    }
  }

  refreshUI() {
    if (this.container) {
      this.container.remove();
      this.createUI();
    }
  }

  injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .kimi-voyager-folders {
        margin-bottom: 16px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .kimi-voyager-folders-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      
      .kimi-voyager-folders-title {
        font-weight: 600;
        font-size: 14px;
        color: #e5e7eb;
      }
      
      .kimi-voyager-folders-add-btn {
        width: 24px;
        height: 24px;
        border: none;
        background: #4f46e5;
        color: white;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        transition: all 0.2s;
      }
      
      .kimi-voyager-folders-add-btn:hover {
        background: #4338ca;
        transform: scale(1.1);
      }
      
      .kimi-voyager-folders-empty {
        text-align: center;
        color: #9ca3af;
        font-size: 13px;
        padding: 16px;
      }
      
      .kimi-voyager-folder-item {
        margin-bottom: 4px;
        border-radius: 8px;
        transition: all 0.2s;
        border: 2px solid transparent;
      }
      
      .kimi-voyager-folder-item:hover {
        background: rgba(255, 255, 255, 0.05);
      }
      
      .kimi-voyager-folder-item.drag-over {
        background: rgba(79, 70, 229, 0.2);
        border-color: #4f46e5;
      }
      
      /* 拖拽时的对话项样式 */
      a[draggable="true"].dragging {
        opacity: 0.5;
        cursor: grabbing;
      }
      
      a[draggable="true"] {
        cursor: grab;
      }
      
      .kimi-voyager-folder-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        cursor: pointer;
        border-radius: 8px;
      }
      
      .kimi-voyager-folder-icon {
        font-size: 16px;
      }
      
      .kimi-voyager-folder-name {
        flex: 1;
        font-size: 14px;
        color: #e5e7eb;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .kimi-voyager-folder-count {
        font-size: 12px;
        color: #6b7280;
      }
      
      .kimi-voyager-folder-actions {
        opacity: 0;
        transition: opacity 0.2s;
      }
      
      .kimi-voyager-folder-item:hover .kimi-voyager-folder-actions {
        opacity: 1;
      }
      
      .kimi-voyager-folder-action-btn {
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
      }
      
      .kimi-voyager-folder-action-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #e5e7eb;
      }
      
      .kimi-voyager-folder-content {
        margin-left: 24px;
        border-left: 1px solid rgba(255, 255, 255, 0.1);
        padding-left: 8px;
      }
      
      .kimi-voyager-conversation-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        font-size: 13px;
        color: #9ca3af;
        cursor: pointer;
        border-radius: 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .kimi-voyager-conversation-item:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #e5e7eb;
      }
      
      .kimi-voyager-context-menu {
        background: #374151;
        border-radius: 8px;
        padding: 4px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
        min-width: 150px;
      }
      
      .kimi-voyager-menu-item {
        padding: 8px 12px;
        font-size: 14px;
        color: #e5e7eb;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s;
      }
      
      .kimi-voyager-menu-item:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      
      .kimi-voyager-menu-item.danger {
        color: #ef4444;
      }
      
      .kimi-voyager-menu-item.danger:hover {
        background: rgba(239, 68, 68, 0.1);
      }
      
      /* 表单样式 */
      .kimi-voyager-form .form-group {
        margin-bottom: 16px;
      }
      
      .kimi-voyager-form label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: #6b7280;
        margin-bottom: 8px;
      }
      
      .kimi-voyager-form input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
      }
      
      .kimi-voyager-form input:focus {
        outline: none;
        border-color: #4f46e5;
      }
      
      .icon-selector, .color-selector {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      
      .icon-btn, .color-btn {
        width: 36px;
        height: 36px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        background: white;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .icon-btn.selected, .color-btn.selected {
        border-color: #4f46e5;
        box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
      }
      
      .icon-btn {
        font-size: 18px;
      }
    `;
    document.head.appendChild(style);
  }

  destroy() {
    if (this.dragDropInterval) {
      clearInterval(this.dragDropInterval);
      this.dragDropInterval = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.isInitialized = false;
  }
}
