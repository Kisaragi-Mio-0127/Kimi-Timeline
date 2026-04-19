/**
 * Timeline - 时间轴导航功能
 * 悬浮显示用户对话内容，点击跳转到对应消息
 */

import { createElement, scrollToElement, throttle } from '../../utils/dom.js';

export class Timeline {
  constructor() {
    this.container = null;
    this.messages = [];
    this.currentIndex = 0;
    this.isVisible = true;
    this.updateInterval = null;
  }

  async init() {
    console.log('🕐 Initializing Timeline...');
    
    this.createUI();
    this.injectStyles();
    this.startMessageUpdate();
    this.setupScrollHandler();
  }

  createUI() {
    this.container = createElement('div', {
      className: 'kimi-voyager-timeline',
      children: [
        createElement('div', {
          className: 'kimi-voyager-timeline-header',
          children: [
            createElement('span', { text: '💬 对话导航' }),
            createElement('button', {
              className: 'kimi-voyager-timeline-toggle',
              text: '−',
              events: {
                click: () => this.toggleVisibility()
              }
            })
          ]
        }),
        createElement('div', {
          className: 'kimi-voyager-timeline-content'
        })
      ]
    });

    document.body.appendChild(this.container);
  }

  startMessageUpdate() {
    // 初始更新
    this.updateMessages();
    
    // 定期更新消息列表（轮询而非 MutationObserver）
    this.updateInterval = setInterval(() => {
      this.updateMessages();
    }, 2000);
  }

  updateMessages() {
    // 使用多种选择器尝试找到消息元素
    let allMessageElements = [];
    
    const selectors = [
      '.chat-content-item',
      '[class*="chat-content-item"]',
      '[data-testid="conversation-turn"]',
      '.message-item',
      '[class*="message-item"]'
    ];
    
    for (const selector of selectors) {
      allMessageElements = document.querySelectorAll(selector);
      if (allMessageElements.length > 0) break;
    }
    
    // 如果没找到，尝试通过聊天容器获取
    if (allMessageElements.length === 0) {
      const chatList = document.querySelector('.chat-content-list') || 
                       document.querySelector('[class*="chat-content-list"]') ||
                       document.querySelector('main');
      if (chatList) {
        allMessageElements = chatList.querySelectorAll(':scope > div');
      }
    }
    
    // 过滤出用户消息
    const userMessages = [];
    allMessageElements.forEach((el, index) => {
      let isUser = false;
      
      // 方式1: 通过class判断
      if (el.classList.contains('chat-content-item-user') || 
          el.className.includes('user')) {
        isUser = true;
      }
      
      // 方式2: 通过子元素判断
      if (!isUser && el.querySelector('.user-content, [class*="user-content"]')) {
        isUser = true;
      }
      
      // 方式3: 通过data属性判断
      if (el.dataset.role === 'user' || el.getAttribute('data-role') === 'user') {
        isUser = true;
      }
      
      // 方式4: 通过内容特征判断
      if (!isUser) {
        const hasUserContent = el.querySelector('.user-content') !== null;
        const hasMarkdown = el.querySelector('.markdown-container, .markdown') !== null;
        if (hasUserContent && !hasMarkdown) {
          isUser = true;
        }
      }
      
      if (isUser) {
        // 获取消息内容
        let contentText = '';
        const contentSelectors = [
          '.user-content',
          '[class*="user-content"]',
          '.content',
          '[class*="content"]'
        ];
        
        for (const selector of contentSelectors) {
          const contentEl = el.querySelector(selector);
          if (contentEl) {
            contentText = contentEl.textContent.trim();
            break;
          }
        }
        
        // 如果没找到，获取元素文本
        if (!contentText) {
          contentText = el.textContent.trim();
        }
        
        // 截断显示
        const displayText = contentText.length > 50 
          ? contentText.slice(0, 50) + '...' 
          : contentText;
        
        userMessages.push({
          index: userMessages.length,
          element: el,
          originalIndex: index,
          role: 'user',
          fullText: contentText,
          displayText: displayText,
          isStarred: el.dataset.starred === 'true'
        });
      }
    });
    
    // 如果消息数量变化，重新渲染
    if (userMessages.length !== this.messages.length) {
      console.log(`🕐 Timeline: Found ${userMessages.length} user messages`);
      this.messages = userMessages;
      this.renderTimeline();
    }
  }

  renderTimeline() {
    const content = this.container.querySelector('.kimi-voyager-timeline-content');
    content.innerHTML = '';

    if (this.messages.length === 0) {
      content.appendChild(createElement('div', {
        className: 'kimi-voyager-timeline-empty',
        text: '暂无用户消息'
      }));
      return;
    }

    // 创建消息列表
    const list = createElement('div', {
      className: 'kimi-voyager-timeline-list'
    });

    this.messages.forEach((msg, index) => {
      const item = createElement('div', {
        className: `kimi-voyager-timeline-item ${index === this.currentIndex ? 'active' : ''} ${msg.isStarred ? 'starred' : ''}`,
        attributes: { 'data-index': index },
        events: {
          click: () => this.navigateToMessage(index),
          contextmenu: (e) => this.showItemContextMenu(e, index)
        },
        children: [
          createElement('span', {
            className: 'timeline-item-number',
            text: `${index + 1}.`
          }),
          createElement('span', {
            className: 'timeline-item-text',
            text: msg.displayText || '(空消息)'
          })
        ]
      });

      list.appendChild(item);
    });

    content.appendChild(list);
    
    // 添加统计
    const stats = createElement('div', {
      className: 'kimi-voyager-timeline-stats',
      text: `共 ${this.messages.length} 条提问`
    });
    content.appendChild(stats);
  }

  setupScrollHandler() {
    const handleScroll = throttle(() => {
      this.updateCurrentIndex();
    }, 100);

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  updateCurrentIndex() {
    if (this.messages.length === 0) return;
    
    const viewportCenter = window.innerHeight / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;

    this.messages.forEach((msg, index) => {
      const rect = msg.element.getBoundingClientRect();
      const elementCenter = rect.top + rect.height / 2;
      const distance = Math.abs(elementCenter - viewportCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== this.currentIndex) {
      this.currentIndex = closestIndex;
      this.highlightCurrentItem();
      
      // 滚动时间轴到当前项
      this.scrollTimelineToCurrent();
    }
  }

  highlightCurrentItem() {
    this.container.querySelectorAll('.kimi-voyager-timeline-item').forEach((item, index) => {
      item.classList.toggle('active', index === this.currentIndex);
    });
  }

  scrollTimelineToCurrent() {
    const content = this.container.querySelector('.kimi-voyager-timeline-content');
    const currentItem = this.container.querySelector('.kimi-voyager-timeline-item.active');
    if (currentItem && content) {
      const itemTop = currentItem.offsetTop;
      const contentHeight = content.clientHeight;
      const itemHeight = currentItem.clientHeight;
      content.scrollTo({
        top: itemTop - contentHeight / 2 + itemHeight / 2,
        behavior: 'smooth'
      });
    }
  }

  navigateToMessage(index) {
    if (index >= 0 && index < this.messages.length) {
      const message = this.messages[index];
      scrollToElement(message.element);
      this.currentIndex = index;
      this.highlightCurrentItem();
    }
  }

  showItemContextMenu(event, index) {
    event.preventDefault();

    document.querySelectorAll('.kimi-voyager-timeline-menu').forEach(m => m.remove());

    const isStarred = this.messages[index].isStarred;

    const menu = createElement('div', {
      className: 'kimi-voyager-timeline-menu',
      styles: {
        position: 'fixed',
        left: `${event.clientX}px`,
        top: `${event.clientY}px`,
        zIndex: '999999'
      },
      children: [
        createElement('div', {
          className: 'menu-item',
          text: isStarred ? '取消星标' : '添加星标',
          events: {
            click: () => {
              this.toggleStar(index);
              menu.remove();
            }
          }
        }),
        createElement('div', {
          className: 'menu-item',
          text: '复制内容',
          events: {
            click: () => {
              this.copyMessageContent(index);
              menu.remove();
            }
          }
        }),
        createElement('div', {
          className: 'menu-item divider'
        }),
        createElement('div', {
          className: 'menu-item',
          text: '跳转到顶部',
          events: {
            click: () => {
              this.navigateToMessage(0);
              menu.remove();
            }
          }
        }),
        createElement('div', {
          className: 'menu-item',
          text: '跳转到底部',
          events: {
            click: () => {
              this.navigateToMessage(this.messages.length - 1);
              menu.remove();
            }
          }
        })
      ]
    });

    document.body.appendChild(menu);

    setTimeout(() => {
      document.addEventListener('click', function closeMenu() {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      });
    }, 0);
  }

  toggleStar(index) {
    const message = this.messages[index];
    message.isStarred = !message.isStarred;
    message.element.dataset.starred = message.isStarred;
    this.renderTimeline();
  }

  async copyMessageContent(index) {
    const message = this.messages[index];
    
    if (message.fullText) {
      try {
        await navigator.clipboard.writeText(message.fullText);
        showToast('已复制到剪贴板', 'success');
      } catch (err) {
        console.error('Copy failed:', err);
        showToast('复制失败', 'error');
      }
    }
  }

  toggleVisibility() {
    this.isVisible = !this.isVisible;
    this.container.classList.toggle('minimized', !this.isVisible);
    const toggleBtn = this.container.querySelector('.kimi-voyager-timeline-toggle');
    toggleBtn.textContent = this.isVisible ? '−' : '+';
  }

  injectStyles() {
    const style = createElement('style', {
      text: `
        .kimi-voyager-timeline {
          position: fixed;
          left: 8px;
          top: 80px;
          bottom: 80px;
          width: 220px;
          background: var(--kimi-voyager-bg, rgba(31, 41, 55, 0.98));
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 12px;
          box-shadow: var(--kimi-voyager-shadow, 0 10px 40px rgba(0, 0, 0, 0.5));
          z-index: 9999;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
        }

        .kimi-voyager-timeline.minimized {
          width: auto;
          height: auto;
          bottom: auto;
        }

        .kimi-voyager-timeline.minimized .kimi-voyager-timeline-content {
          display: none;
        }

        .kimi-voyager-timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
          flex-shrink: 0;
        }

        .kimi-voyager-timeline-header span {
          font-size: 13px;
          font-weight: 600;
          color: var(--kimi-voyager-text, #e5e7eb);
        }

        .kimi-voyager-timeline-toggle {
          width: 24px;
          height: 24px;
          border: none;
          background: var(--kimi-voyager-bg-hover, rgba(255, 255, 255, 0.1));
          color: var(--kimi-voyager-text, #e5e7eb);
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          transition: all 0.2s;
        }

        .kimi-voyager-timeline-toggle:hover {
          background: var(--kimi-voyager-bg-tertiary, rgba(255, 255, 255, 0.2));
        }

        .kimi-voyager-timeline-content {
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .kimi-voyager-timeline-empty {
          font-size: 13px;
          color: var(--kimi-voyager-text-muted, #6b7280);
          text-align: center;
          padding: 20px 0;
        }

        .kimi-voyager-timeline-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .kimi-voyager-timeline-item {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 12px;
          color: var(--kimi-voyager-text-muted, #9ca3af);
          line-height: 1.4;
          position: relative;
        }

        .kimi-voyager-timeline-item:hover {
          background: var(--kimi-voyager-bg-hover, rgba(255, 255, 255, 0.08));
          color: var(--kimi-voyager-text, #e5e7eb);
        }

        .kimi-voyager-timeline-item.active {
          background: var(--kimi-voyager-bg-active, rgba(79, 70, 229, 0.25));
          color: var(--kimi-voyager-text, #e5e7eb);
          border-left: 3px solid #4f46e5;
        }

        .kimi-voyager-timeline-item.starred {
          background: rgba(251, 191, 36, 0.1);
        }

        .kimi-voyager-timeline-item.starred::before {
          content: '⭐';
          position: absolute;
          right: 8px;
          font-size: 10px;
        }

        .timeline-item-number {
          flex-shrink: 0;
          font-weight: 600;
          color: var(--kimi-voyager-text-muted, #6b7280);
          min-width: 20px;
        }

        .kimi-voyager-timeline-item.active .timeline-item-number {
          color: #4f46e5;
        }

        .timeline-item-text {
          flex: 1;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          word-break: break-word;
        }

        .kimi-voyager-timeline-stats {
          font-size: 11px;
          color: var(--kimi-voyager-text-muted, #6b7280);
          text-align: center;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
          flex-shrink: 0;
        }

        .kimi-voyager-timeline-menu {
          background: var(--kimi-voyager-menu-bg, #374151);
          border-radius: 8px;
          padding: 4px;
          box-shadow: var(--kimi-voyager-shadow, 0 10px 40px rgba(0, 0, 0, 0.4));
          min-width: 120px;
        }

        .kimi-voyager-timeline-menu .menu-item {
          padding: 8px 12px;
          font-size: 13px;
          color: var(--kimi-voyager-text, #e5e7eb);
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .kimi-voyager-timeline-menu .menu-item:hover {
          background: var(--kimi-voyager-menu-hover, rgba(255, 255, 255, 0.1));
        }

        .kimi-voyager-timeline-menu .menu-item.divider {
          height: 1px;
          padding: 0;
          margin: 4px 0;
          background: var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
          pointer-events: none;
        }

        /* 滚动条样式 */
        .kimi-voyager-timeline-content::-webkit-scrollbar {
          width: 4px;
        }

        .kimi-voyager-timeline-content::-webkit-scrollbar-track {
          background: transparent;
        }

        .kimi-voyager-timeline-content::-webkit-scrollbar-thumb {
          background: var(--kimi-voyager-scrollbar, rgba(255, 255, 255, 0.15));
          border-radius: 2px;
        }

        .kimi-voyager-timeline-content::-webkit-scrollbar-thumb:hover {
          background: var(--kimi-voyager-scrollbar-hover, rgba(255, 255, 255, 0.25));
        }
      `
    });
    document.head.appendChild(style);
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

// 简单的 toast 函数
function showToast(message, type = 'success') {
  const toast = createElement('div', {
    className: 'kimi-voyager-toast',
    text: message,
    styles: {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: type === 'success' ? '#10b981' : '#ef4444',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '8px',
      fontSize: '14px',
      zIndex: '999999'
    }
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
