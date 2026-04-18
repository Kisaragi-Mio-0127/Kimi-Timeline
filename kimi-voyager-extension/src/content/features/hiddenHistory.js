/**
 * Hidden History - 隐藏历史对话功能
 * 显示"查看全部"中的历史对话（排除已在侧边栏显示的5条）
 */

import { createElement, showToast } from '../../utils/dom.js';

export class HiddenHistory {
  constructor() {
    this.container = null;
    this.hiddenConversations = [];
    this.sidebarConversations = new Set(); // 侧边栏已显示的对话ID
    this.isExpanded = false;
    this.isLoading = false;
  }

  async init() {
    console.log('📜 Initializing Hidden History...');
    
    this.createUI();
    this.injectStyles();
  }

  createUI() {
    // 查找插入位置（在历史对话区域之后）
    const insertPoint = this.findInsertPoint();
    if (!insertPoint) {
      console.warn('📜 HiddenHistory: Could not find insert point, retrying...');
      setTimeout(() => this.createUI(), 2000);
      return;
    }

    // 创建容器
    this.container = createElement('div', {
      className: 'kimi-voyager-hidden-history',
      children: [
        createElement('div', {
          className: 'kimi-voyager-hidden-history-header',
          events: {
            click: () => this.toggleExpand()
          },
          children: [
            createElement('span', {
              className: 'hidden-history-icon',
              text: this.isExpanded ? '📂' : '📁'
            }),
            createElement('span', {
              className: 'hidden-history-title',
              text: '查看更多历史'
            }),
            createElement('span', {
              className: 'hidden-history-count',
              text: ''
            }),
            createElement('span', {
              className: 'hidden-history-arrow',
              text: this.isExpanded ? '▼' : '▶'
            })
          ]
        }),
        createElement('div', {
          className: 'kimi-voyager-hidden-history-content',
          styles: {
            display: this.isExpanded ? 'block' : 'none'
          }
        })
      ]
    });

    insertPoint.parentElement.insertBefore(this.container, insertPoint.nextSibling);
    console.log('📜 HiddenHistory: UI created');
  }

  findInsertPoint() {
    // 尝试找到历史对话区域的最后一个元素
    const selectors = [
      '.history-part',
      '[class*="history-part"]',
      '[class*="history"]',
      '.sidebar-nav',
      '[class*="sidebar-nav"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        console.log(`📜 HiddenHistory: Found insert point with selector: ${selector}`);
        return el;
      }
    }

    return null;
  }

  // 获取侧边栏中已显示的对话
  getSidebarConversations() {
    const sidebarIds = new Set();
    const sidebar = document.querySelector('.sidebar, [class*="sidebar"], aside, nav');
    
    if (sidebar) {
      const chatLinks = sidebar.querySelectorAll('a[href*="/chat/"]');
      chatLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
          const match = href.match(/\/chat\/([^/?#]+)/);
          if (match) {
            sidebarIds.add(match[1]);
          }
        }
      });
    }
    
    console.log(`📜 Sidebar conversations: ${sidebarIds.size}`);
    return sidebarIds;
  }

  async toggleExpand() {
    this.isExpanded = !this.isExpanded;
    
    const content = this.container.querySelector('.kimi-voyager-hidden-history-content');
    const arrow = this.container.querySelector('.hidden-history-arrow');
    const icon = this.container.querySelector('.hidden-history-icon');
    
    if (this.isExpanded) {
      content.style.display = 'block';
      arrow.textContent = '▼';
      icon.textContent = '📂';
      
      // 如果还没有加载数据，则加载
      if (this.hiddenConversations.length === 0 && !this.isLoading) {
        await this.loadHiddenHistory();
      }
    } else {
      content.style.display = 'none';
      arrow.textContent = '▶';
      icon.textContent = '📁';
    }
  }

  async loadHiddenHistory() {
    this.isLoading = true;
    const content = this.container.querySelector('.kimi-voyager-hidden-history-content');
    content.innerHTML = '<div class="hidden-history-loading">加载中...</div>';

    try {
      // 获取侧边栏已显示的对话
      this.sidebarConversations = this.getSidebarConversations();
      
      // 尝试获取所有历史对话（从"查看全部"）
      const allConversations = await this.fetchAllHistoryConversations();
      
      // 过滤掉已在侧边栏显示的对话
      this.hiddenConversations = allConversations.filter(conv => {
        return !this.sidebarConversations.has(conv.id);
      });
      
      console.log(`📜 Total: ${allConversations.length}, Sidebar: ${this.sidebarConversations.size}, Hidden: ${this.hiddenConversations.length}`);
      
      if (this.hiddenConversations.length > 0) {
        this.renderConversations();
        showToast(`已加载 ${this.hiddenConversations.length} 条隐藏历史对话`, 'success');
      } else {
        content.innerHTML = '<div class="hidden-history-empty">暂无更多历史对话</div>';
      }
    } catch (error) {
      console.error('Failed to load hidden history:', error);
      content.innerHTML = '<div class="hidden-history-error">加载失败，请重试</div>';
    } finally {
      this.isLoading = false;
    }
  }

  // 获取所有历史对话（模拟点击"查看全部"获取）
  async fetchAllHistoryConversations() {
    const conversations = [];
    
    // 方法1: 尝试从页面的 JavaScript 变量中获取
    try {
      // 检查是否有全局的对话数据
      if (window.__INITIAL_STATE__?.conversations) {
        window.__INITIAL_STATE__.conversations.forEach(conv => {
          conversations.push({
            id: conv.id || conv.chatId,
            title: conv.title || conv.name || '未命名对话',
            href: `/chat/${conv.id || conv.chatId}`,
            isHidden: true
          });
        });
      }
      
      if (window.__DATA__?.conversations) {
        window.__DATA__.conversations.forEach(conv => {
          conversations.push({
            id: conv.id || conv.chatId,
            title: conv.title || conv.name || '未命名对话',
            href: `/chat/${conv.id || conv.chatId}`,
            isHidden: true
          });
        });
      }
    } catch (e) {
      console.log('Could not access window data:', e);
    }

    // 方法2: 尝试从 localStorage 中获取
    try {
      const chatHistory = localStorage.getItem('chatHistory');
      if (chatHistory) {
        const history = JSON.parse(chatHistory);
        if (Array.isArray(history)) {
          history.forEach(conv => {
            if (conv.id && !conversations.find(c => c.id === conv.id)) {
              conversations.push({
                id: conv.id,
                title: conv.title || '未命名对话',
                href: `/chat/${conv.id}`,
                isHidden: true
              });
            }
          });
        }
      }
    } catch (e) {
      console.log('Could not access localStorage:', e);
    }

    // 方法3: 尝试从 sessionStorage 中获取
    try {
      const sessionHistory = sessionStorage.getItem('chatHistory');
      if (sessionHistory) {
        const history = JSON.parse(sessionHistory);
        if (Array.isArray(history)) {
          history.forEach(conv => {
            if (conv.id && !conversations.find(c => c.id === conv.id)) {
              conversations.push({
                id: conv.id,
                title: conv.title || '未命名对话',
                href: `/chat/${conv.id}`,
                isHidden: true
              });
            }
          });
        }
      }
    } catch (e) {
      console.log('Could not access sessionStorage:', e);
    }

    // 方法4: 尝试通过 API 获取（如果页面提供了）
    try {
      // 检查是否有全局的 fetchHistory 函数
      if (typeof window.fetchChatHistory === 'function') {
        const history = await window.fetchChatHistory();
        if (Array.isArray(history)) {
          history.forEach(conv => {
            if (conv.id && !conversations.find(c => c.id === conv.id)) {
              conversations.push({
                id: conv.id,
                title: conv.title || '未命名对话',
                href: `/chat/${conv.id}`,
                isHidden: true
              });
            }
          });
        }
      }
    } catch (e) {
      console.log('Could not fetch from API:', e);
    }

    // 去重
    const uniqueConversations = [];
    const seenIds = new Set();
    conversations.forEach(conv => {
      if (!seenIds.has(conv.id)) {
        seenIds.add(conv.id);
        uniqueConversations.push(conv);
      }
    });

    return uniqueConversations;
  }

  renderConversations() {
    const content = this.container.querySelector('.kimi-voyager-hidden-history-content');
    content.innerHTML = '';

    if (this.hiddenConversations.length === 0) {
      content.innerHTML = '<div class="hidden-history-empty">暂无更多历史对话</div>';
      return;
    }

    const list = createElement('div', {
      className: 'hidden-history-list'
    });

    this.hiddenConversations.forEach(conv => {
      const item = createElement('div', {
        className: 'hidden-history-item',
        attributes: {
          'data-conv-id': conv.id,
          draggable: 'true'
        },
        events: {
          click: () => this.openConversation(conv),
          dragstart: (e) => this.handleDragStart(e, conv)
        },
        children: [
          createElement('span', { text: '💬 ' }),
          createElement('span', {
            className: 'hidden-history-item-title',
            text: conv.title || '未命名对话'
          })
        ]
      });

      list.appendChild(item);
    });

    content.appendChild(list);
    
    // 更新计数
    const countEl = this.container.querySelector('.hidden-history-count');
    if (countEl) {
      countEl.textContent = `(${this.hiddenConversations.length})`;
    }
  }

  handleDragStart(e, conv) {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'conversation',
      id: conv.id,
      title: conv.title
    }));
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = '0.5';
  }

  openConversation(conv) {
    if (conv.href) {
      window.location.href = conv.href;
    } else if (conv.id) {
      window.location.href = `/chat/${conv.id}`;
    }
  }

  injectStyles() {
    const style = createElement('style', {
      text: `
        .kimi-voyager-hidden-history {
          margin-bottom: 16px;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .kimi-voyager-hidden-history-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 8px;
        }
        
        .kimi-voyager-hidden-history-header:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        
        .hidden-history-icon {
          font-size: 14px;
        }
        
        .hidden-history-title {
          flex: 1;
          font-size: 14px;
          color: #9ca3af;
        }
        
        .hidden-history-count {
          font-size: 12px;
          color: #6b7280;
        }
        
        .hidden-history-arrow {
          font-size: 10px;
          color: #6b7280;
        }
        
        .kimi-voyager-hidden-history-content {
          padding: 8px 0 8px 24px;
        }
        
        .hidden-history-loading,
        .hidden-history-empty,
        .hidden-history-error {
          padding: 16px;
          text-align: center;
          font-size: 13px;
          color: #6b7280;
        }
        
        .hidden-history-error {
          color: #ef4444;
        }
        
        .hidden-history-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .hidden-history-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 13px;
          color: #9ca3af;
        }
        
        .hidden-history-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #e5e7eb;
        }
        
        .hidden-history-item-title {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `
    });
    document.head.appendChild(style);
  }

  destroy() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
