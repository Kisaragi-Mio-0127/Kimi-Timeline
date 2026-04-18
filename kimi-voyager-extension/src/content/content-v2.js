/**
 * Kimi Voyager - Content Script
 * 版本: 1.0.0-Modified
 */

(function() {
  'use strict';

  // ============ DOM Utilities ============
  function createElement(tag, options = {}) {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.id) element.id = options.id;
    if (options.text) element.textContent = options.text;
    if (options.html) element.innerHTML = options.html;
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }
    if (options.styles) Object.assign(element.style, options.styles);
    if (options.children) {
      options.children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else {
          element.appendChild(child);
        }
      });
    }
    if (options.events) {
      Object.entries(options.events).forEach(([event, handler]) => {
        element.addEventListener(event, handler);
      });
    }
    return element;
  }

  function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  function showToast(message, type = 'info', duration = 3000) {
    const toast = createElement('div', {
      className: 'kimi-voyager-toast',
      text: message,
      styles: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '8px',
        backgroundColor: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6',
        color: '#fff',
        fontSize: '14px',
        zIndex: '9999999',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        transition: 'all 0.3s ease'
      }
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ============ Global State ============
  const globalState = {
    folders: [],
    visualEffect: 'none',
    
    async loadFolders() {
      try {
        const response = await chrome.storage.local.get('folders');
        this.folders = response.folders || [];
      } catch (error) {
        this.folders = [];
      }
      return this.folders;
    },
    
    async saveFolders() {
      await chrome.storage.local.set({ folders: this.folders });
    },
    
    addConversationToFolder(convId, convTitle, folderId) {
      const folder = this.folders.find(f => f.id === folderId);
      if (!folder) return false;
      if (!folder.conversations) folder.conversations = [];
      if (folder.conversations.find(c => c.id === convId)) return false;
      
      folder.conversations.push({
        id: convId,
        title: convTitle || '未命名对话',
        addedAt: Date.now()
      });
      this.saveFolders();
      return true;
    }
  };

  // ============ Visual Effects ============
  class VisualEffects {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.animationId = null;
      this.particles = [];
      this.type = 'none';
      this.isRunning = false;
    }

    init(type = 'none') {
      if (type === 'none') {
        this.destroy();
        return;
      }
      
      this.type = type;
      if (this.isRunning) this.destroy();
      
      this.canvas = createElement('canvas', {
        id: 'kimi-voyager-effects',
        styles: {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: '9998'
        }
      });
      document.body.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
      
      this.createParticles();
      this.animate();
      this.isRunning = true;
    }

    resize() {
      if (this.canvas) {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
      }
    }

    createParticles() {
      this.particles = [];
      const count = this.type === 'rain' ? 200 : 100;
      for (let i = 0; i < count; i++) {
        this.particles.push(this.createParticle());
      }
    }

    createParticle() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      switch (this.type) {
        case 'snow':
          return {
            x: Math.random() * w,
            y: Math.random() * h,
            size: Math.random() * 3 + 1,
            speedY: Math.random() * 1 + 0.5,
            speedX: Math.random() * 0.5 - 0.25,
            opacity: Math.random() * 0.5 + 0.3
          };
        case 'sakura':
          return {
            x: Math.random() * w,
            y: Math.random() * h,
            size: Math.random() * 5 + 3,
            speedY: Math.random() * 0.8 + 0.3,
            speedX: Math.random() * 1 - 0.5,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 2 - 1,
            opacity: Math.random() * 0.4 + 0.3,
            color: `hsl(${330 + Math.random() * 30}, ${70 + Math.random() * 20}%, ${80 + Math.random() * 15}%)`
          };
        case 'rain':
          return {
            x: Math.random() * w,
            y: Math.random() * h,
            length: Math.random() * 20 + 10,
            speedY: Math.random() * 8 + 12,
            speedX: Math.random() * 0.5 - 0.25,
            opacity: Math.random() * 0.3 + 0.1
          };
        default:
          return {};
      }
    }

    animate() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      
      ctx.clearRect(0, 0, w, h);
      
      this.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        
        switch (this.type) {
          case 'snow':
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            p.y += p.speedY;
            p.x += p.speedX;
            if (p.y > h) { p.y = -5; p.x = Math.random() * w; }
            break;
          case 'sakura':
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += p.rotationSpeed;
            if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
            break;
          case 'rain':
            // 雨滴 - 绘制为细长的蓝色线条
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.speedX * 2, p.y + p.length);
            ctx.strokeStyle = `rgba(160, 192, 240, ${p.opacity})`;
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
            // 雨滴头部（小圆点）
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 220, 255, ${p.opacity + 0.1})`;
            ctx.fill();
            p.y += p.speedY;
            p.x += p.speedX * 0.5;
            if (p.y > h + 20) { p.y = -p.length - Math.random() * 50; p.x = Math.random() * w; }
            break;
        }
        ctx.restore();
      });
      
      this.animationId = requestAnimationFrame(() => this.animate());
    }

    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
      }
      this.isRunning = false;
    }

    setType(type) {
      if (this.type === type) return;
      this.type = type;
      if (type === 'none') {
        this.destroy();
      } else {
        this.init(type);
      }
    }
  }

  // ============ Timeline with Prompt List ============
  class Timeline {
    constructor() {
      this.container = null;
      this.promptList = null;
      this.track = null;
      this.messages = [];
      this.currentIndex = 0;
      this.isDragging = false;
      this.dragStartY = 0;
      this.dragStartTop = 0;
      this.updateInterval = null;
      this.preview = null;
    }

    init() {
      console.log('🕐 Timeline initializing...');
      this.createUI();
      this.injectStyles();
      this.startMessageUpdate();
      this.setupScrollHandler();
    }

    createUI() {
      // 主容器包含两部分：左侧提示词列表 + 右侧时间轴
      this.container = createElement('div', {
        className: 'kimi-voyager-timeline-wrapper',
        id: 'kimi-voyager-timeline-wrapper'
      });

      // 左侧提示词列表面板（默认关闭）
      this.promptList = createElement('div', {
        className: 'kimi-voyager-prompt-list collapsed',
        children: [
          createElement('div', {
            className: 'kimi-voyager-prompt-list-header',
            children: [
              createElement('span', { text: '💬 对话列表' }),
              createElement('button', {
                className: 'kimi-voyager-prompt-list-close',
                text: '×',
                events: { click: () => this.togglePromptList() }
              })
            ]
          }),
          createElement('div', { className: 'kimi-voyager-prompt-list-content' })
        ]
      });

      // 右侧时间轴
      this.track = createElement('div', {
        className: 'kimi-voyager-timeline expanded',
        id: 'kimi-voyager-timeline',
        children: [
          createElement('div', {
            className: 'kimi-voyager-timeline-draghandle',
            title: '拖动移动位置',
            children: [createElement('span', { text: '⋮⋮' })]
          }),
          createElement('div', {
            className: 'kimi-voyager-timeline-toggle-btn',
            title: '展开/收起对话列表',
            events: { click: () => this.togglePromptList() },
            children: [createElement('span', { text: '☰' })]
          }),
          createElement('div', {
            className: 'kimi-voyager-timeline-track-container',
            children: [
              createElement('div', { className: 'kimi-voyager-timeline-line' }),
              createElement('div', { className: 'kimi-voyager-timeline-nodes' })
            ]
          })
        ]
      });

      this.container.appendChild(this.promptList);
      this.container.appendChild(this.track);
      document.body.appendChild(this.container);

      this.setupDragging();
    }

    togglePromptList() {
      this.promptList.classList.toggle('collapsed');
      this.track.classList.toggle('expanded');
    }

    setupDragging() {
      const dragHandle = this.track.querySelector('.kimi-voyager-timeline-draghandle');
      
      dragHandle.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.dragStartY = e.clientY;
        this.dragStartTop = this.container.offsetTop;
        this.container.style.cursor = 'grabbing';
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        const deltaY = e.clientY - this.dragStartY;
        let newTop = this.dragStartTop + deltaY;
        const maxTop = window.innerHeight - this.track.offsetHeight;
        newTop = Math.max(20, Math.min(newTop, maxTop));
        this.container.style.top = newTop + 'px';
        this.container.style.bottom = 'auto';
      });

      document.addEventListener('mouseup', () => {
        if (this.isDragging) {
          this.isDragging = false;
          this.container.style.cursor = 'default';
        }
      });
    }

    startMessageUpdate() {
      this.updateMessages();
      this.updateInterval = setInterval(() => this.updateMessages(), 2000);
    }

    updateMessages() {
      let allMessages = [];
      const selectors = [
        '.chat-content-item',
        '[class*="chat-content-item"]',
        '[data-testid="conversation-turn"]',
        '.message-item',
        '[class*="message-item"]'
      ];
      
      for (const selector of selectors) {
        allMessages = document.querySelectorAll(selector);
        if (allMessages.length > 0) break;
      }
      
      if (allMessages.length === 0) {
        const chatList = document.querySelector('.chat-content-list') || document.querySelector('main');
        if (chatList) allMessages = chatList.querySelectorAll(':scope > div');
      }
      
      const userMessages = [];
      allMessages.forEach((el, idx) => {
        let isUser = false;
        if (el.className.includes('user')) isUser = true;
        if (el.querySelector('.user-content, [class*="user-content"]')) isUser = true;
        if (el.dataset.role === 'user') isUser = true;
        
        if (!isUser) {
          const hasUserContent = el.querySelector('.user-content') !== null;
          const hasMarkdown = el.querySelector('.markdown-container, .markdown') !== null;
          if (hasUserContent && !hasMarkdown) isUser = true;
        }
        
        if (isUser) {
          let contentText = '';
          const contentEl = el.querySelector('.user-content') || el.querySelector('[class*="user-content"]');
          if (contentEl) contentText = contentEl.textContent.trim();
          if (!contentText) contentText = el.textContent.trim().substring(0, 100);
          
          userMessages.push({
            index: userMessages.length,
            element: el,
            originalIndex: idx,
            displayText: contentText.length > 60 ? contentText.substring(0, 60) + '...' : contentText,
            fullText: contentText
          });
        }
      });
      
      if (userMessages.length !== this.messages.length) {
        this.messages = userMessages;
        this.renderTimeline();
        this.renderPromptList();
      }
    }

    renderTimeline() {
      const nodesContainer = this.track.querySelector('.kimi-voyager-timeline-nodes');
      nodesContainer.innerHTML = '';

      if (this.messages.length === 0) {
        nodesContainer.appendChild(createElement('div', {
          className: 'kimi-voyager-timeline-empty',
          text: '无消息'
        }));
        return;
      }

      this.messages.forEach((msg, index) => {
        const node = createElement('div', {
          className: `kimi-voyager-timeline-node ${index === this.currentIndex ? 'active' : ''}`,
          attributes: { 'data-index': index },
          events: {
            click: () => this.navigateToMessage(index),
            mouseenter: (e) => this.showPreview(e, msg),
            mouseleave: () => this.hidePreview()
          }
        });
        nodesContainer.appendChild(node);
      });
    }

    renderPromptList() {
      const content = this.promptList.querySelector('.kimi-voyager-prompt-list-content');
      content.innerHTML = '';

      if (this.messages.length === 0) {
        content.appendChild(createElement('div', {
          className: 'kimi-voyager-prompt-empty',
          text: '暂无用户消息'
        }));
        return;
      }

      const list = createElement('div', { className: 'kimi-voyager-prompt-items' });

      this.messages.forEach((msg, index) => {
        const item = createElement('div', {
          className: `kimi-voyager-prompt-item ${index === this.currentIndex ? 'active' : ''}`,
          attributes: { 'data-index': index },
          events: {
            click: () => this.navigateToMessage(index),
            contextmenu: (e) => this.showItemContextMenu(e, msg)
          },
          children: [
            createElement('span', {
              className: 'prompt-item-number',
              text: `${index + 1}.`
            }),
            createElement('span', {
              className: 'prompt-item-text',
              text: msg.displayText || '(空消息)'
            })
          ]
        });
        list.appendChild(item);
      });

      content.appendChild(list);
      content.appendChild(createElement('div', {
        className: 'kimi-voyager-prompt-stats',
        text: `共 ${this.messages.length} 条提问`
      }));
    }

    showItemContextMenu(event, msg) {
      event.preventDefault();
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
          createElement('div', {
            className: 'menu-item',
            text: '📋 复制内容',
            events: {
              click: () => {
                navigator.clipboard.writeText(msg.fullText).then(() => {
                  showToast('已复制到剪贴板', 'success');
                });
                menu.remove();
              }
            }
          }),
          createElement('div', {
            className: 'menu-item',
            text: '⭐ 添加星标',
            events: {
              click: () => {
                showToast('已添加星标', 'success');
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

    showPreview(event, msg) {
      this.hidePreview();
      
      this.preview = createElement('div', {
        className: 'kimi-voyager-timeline-preview',
        styles: {
          position: 'fixed',
          right: '60px',
          top: `${event.clientY}px`,
          transform: 'translateY(-50%)',
          zIndex: '99999'
        },
        children: [
          createElement('div', {
            className: 'preview-content',
            text: msg.displayText || '(空消息)'
          })
        ]
      });

      document.body.appendChild(this.preview);
    }

    hidePreview() {
      if (this.preview) {
        this.preview.remove();
        this.preview = null;
      }
    }

    setupScrollHandler() {
      window.addEventListener('scroll', throttle(() => this.updateCurrentIndex(), 100), { passive: true });
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
        this.highlightCurrent();
      }
    }

    highlightCurrent() {
      // 高亮时间轴节点
      this.track.querySelectorAll('.kimi-voyager-timeline-node').forEach((node, index) => {
        node.classList.toggle('active', index === this.currentIndex);
      });
      // 高亮列表项
      this.promptList.querySelectorAll('.kimi-voyager-prompt-item').forEach((item, index) => {
        item.classList.toggle('active', index === this.currentIndex);
      });
      
      // 滚动列表到当前项
      const activeItem = this.promptList.querySelector('.kimi-voyager-prompt-item.active');
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    navigateToMessage(index) {
      if (index >= 0 && index < this.messages.length) {
        const msg = this.messages[index];
        msg.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.currentIndex = index;
        this.highlightCurrent();
      }
    }

    injectStyles() {
      const style = createElement('style', {
        text: `
          /* Timeline Wrapper */
          .kimi-voyager-timeline-wrapper {
            position: fixed;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            display: flex;
            align-items: flex-start;
            gap: 8px;
            z-index: 9999;
            user-select: none;
          }

          /* Prompt List - Left Panel */
          .kimi-voyager-prompt-list {
            width: 220px;
            max-height: 70vh;
            background: rgba(31, 41, 55, 0.98);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease;
            overflow: hidden;
          }

          .kimi-voyager-prompt-list.collapsed {
            width: 0;
            padding: 0;
            opacity: 0;
            pointer-events: none;
          }

          .kimi-voyager-prompt-list-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            flex-shrink: 0;
          }

          .kimi-voyager-prompt-list-header span {
            font-size: 13px;
            font-weight: 600;
            color: #e5e7eb;
          }

          .kimi-voyager-prompt-list-close {
            width: 22px;
            height: 22px;
            border: none;
            background: rgba(255, 255, 255, 0.1);
            color: #9ca3af;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .kimi-voyager-prompt-list-close:hover {
            background: rgba(255, 255, 255, 0.2);
            color: #e5e7eb;
          }

          .kimi-voyager-prompt-list-content {
            overflow-y: auto;
            flex: 1;
          }

          .kimi-voyager-prompt-list-content::-webkit-scrollbar {
            width: 4px;
          }

          .kimi-voyager-prompt-list-content::-webkit-scrollbar-track {
            background: transparent;
          }

          .kimi-voyager-prompt-list-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 2px;
          }

          .kimi-voyager-prompt-empty {
            font-size: 13px;
            color: #6b7280;
            text-align: center;
            padding: 20px 0;
          }

          .kimi-voyager-prompt-items {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .kimi-voyager-prompt-item {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            padding: 8px 10px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 12px;
            color: #9ca3af;
            line-height: 1.4;
          }

          .kimi-voyager-prompt-item:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #e5e7eb;
          }

          .kimi-voyager-prompt-item.active {
            background: rgba(79, 70, 229, 0.25);
            color: #e5e7eb;
            border-left: 3px solid #4f46e5;
          }

          .prompt-item-number {
            flex-shrink: 0;
            font-weight: 600;
            color: #6b7280;
            min-width: 20px;
          }

          .kimi-voyager-prompt-item.active .prompt-item-number {
            color: #4f46e5;
          }

          .prompt-item-text {
            flex: 1;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            word-break: break-word;
          }

          .kimi-voyager-prompt-stats {
            font-size: 11px;
            color: #6b7280;
            text-align: center;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }

          /* Timeline - Right Track */
          .kimi-voyager-timeline {
            width: 40px;
            display: flex;
            flex-direction: column;
            align-items: center;
            transition: all 0.3s ease;
          }

          .kimi-voyager-timeline.expanded {
            margin-left: 228px;
          }

          .kimi-voyager-timeline-draghandle {
            width: 32px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            color: rgba(255, 255, 255, 0.4);
            font-size: 12px;
            margin-bottom: 4px;
            border-radius: 4px;
            transition: all 0.2s;
          }

          .kimi-voyager-timeline-draghandle:hover {
            background: rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.7);
          }

          .kimi-voyager-timeline-toggle-btn {
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: rgba(255, 255, 255, 0.5);
            font-size: 14px;
            margin-bottom: 8px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.2s;
          }

          .kimi-voyager-timeline-toggle-btn:hover {
            background: rgba(255, 255, 255, 0.15);
            color: rgba(255, 255, 255, 0.8);
          }

          .kimi-voyager-timeline-track-container {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 8px 0;
          }

          .kimi-voyager-timeline-line {
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            width: 2px;
            background: rgba(255, 255, 255, 0.15);
            transform: translateX(-50%);
          }

          .kimi-voyager-timeline-nodes {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            position: relative;
            z-index: 1;
          }

          .kimi-voyager-timeline-empty {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.3);
            padding: 10px 0;
          }

          .kimi-voyager-timeline-node {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
          }

          .kimi-voyager-timeline-node:hover {
            background: rgba(255, 255, 255, 0.7);
            transform: scale(1.3);
          }

          .kimi-voyager-timeline-node.active {
            background: #4f46e5;
            box-shadow: 0 0 8px rgba(79, 70, 229, 0.6);
            transform: scale(1.2);
          }

          /* Preview Tooltip */
          .kimi-voyager-timeline-preview {
            background: rgba(31, 41, 55, 0.95);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 10px 14px;
            max-width: 260px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            pointer-events: none;
            animation: previewFadeIn 0.15s ease;
          }

          @keyframes previewFadeIn {
            from { opacity: 0; transform: translateY(-50%) translateX(5px); }
            to { opacity: 1; transform: translateY(-50%) translateX(0); }
          }

          .kimi-voyager-timeline-preview .preview-content {
            font-size: 13px;
            color: #e5e7eb;
            line-height: 1.5;
            word-break: break-word;
          }

          /* Context Menu */
          .kimi-voyager-context-menu {
            background: #374151;
            border-radius: 8px;
            padding: 4px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
            min-width: 140px;
            animation: menuFadeIn 0.15s ease;
          }

          @keyframes menuFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }

          .kimi-voyager-context-menu .menu-item {
            padding: 8px 12px;
            font-size: 13px;
            color: #e5e7eb;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s;
          }

          .kimi-voyager-context-menu .menu-item:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          /* Toast */
          .kimi-voyager-toast {
            animation: toastSlideIn 0.3s ease;
          }

          @keyframes toastSlideIn {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
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
      this.hidePreview();
      if (this.container) {
        this.container.remove();
        this.container = null;
      }
    }
  }

  // ============ Export Manager ============
  class ExportManager {
    constructor() {
      this.buttonInterval = null;
    }

    init() {
      console.log('💾 Export Manager initializing...');
      this.injectStyles();
      this.addExportButton();
    }

    addExportButton() {
      let lastHeader = null;
      
      const tryAddButton = () => {
        const headerSelectors = [
          '[data-testid="chat-header"]',
          '.chat-header',
          '[class*="chat-header"]',
          'header'
        ];
        
        let header = null;
        for (const selector of headerSelectors) {
          header = document.querySelector(selector);
          if (header) break;
        }
        
        if (!header) {
          const chatArea = document.querySelector('.chat-content-list') || 
                          document.querySelector('[class*="chat-content"]');
          if (chatArea) header = chatArea.parentElement;
        }
        
        if (header === lastHeader && header?.querySelector('.kimi-voyager-export-btn')) return;
        lastHeader = header;
        
        if (header && !header.querySelector('.kimi-voyager-export-btn')) {
          const button = createElement('button', {
            className: 'kimi-voyager-export-btn',
            title: '导出对话',
            events: { click: () => this.exportConversation() },
            children: [
              createElement('span', { text: '💾' }),
              createElement('span', { text: '导出' })
            ]
          });
          header.appendChild(button);
          console.log('💾 Export button added');
        }
      };
      
      tryAddButton();
      this.buttonInterval = setInterval(tryAddButton, 2000);
    }

    exportConversation() {
      const messages = [];
      let messageElements = document.querySelectorAll(
        '.chat-content-item, [class*="chat-content-item"], [data-testid="conversation-turn"]'
      );
      
      if (messageElements.length === 0) {
        const chatList = document.querySelector('.chat-content-list') || document.querySelector('main');
        if (chatList) messageElements = chatList.querySelectorAll(':scope > div');
      }
      
      messageElements.forEach(el => {
        let isUser = el.className.includes('user') || el.querySelector('.user-content') !== null;
        let contentEl = el.querySelector('.user-content, .markdown, [class*="content"]');
        if (!contentEl) contentEl = el;
        
        const content = contentEl.textContent.trim();
        if (content) {
          messages.push({ role: isUser ? 'user' : 'assistant', content });
        }
      });

      if (messages.length === 0) {
        showToast('当前对话为空', 'error');
        return;
      }

      let title = document.title.replace(' - Kimi', '').replace(' - Kimi AI', '');
      if (!title || title === 'Kimi') title = '未命名对话';

      const markdown = `# ${title}\n\n` + 
        messages.map(m => `### ${m.role === 'user' ? '👤 用户' : '🤖 Kimi'}\n\n${m.content}\n\n---\n\n`).join('');
      
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = createElement('a', {
        attributes: { href: url, download: `${title}.md` }
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      
      showToast('已导出为 Markdown', 'success');
    }

    injectStyles() {
      const style = createElement('style', {
        text: `
          .kimi-voyager-export-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            margin-left: 10px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.1);
            color: #e5e7eb;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
          }
          .kimi-voyager-export-btn:hover {
            background: rgba(255, 255, 255, 0.2);
          }
        `
      });
      document.head.appendChild(style);
    }

    destroy() {
      if (this.buttonInterval) {
        clearInterval(this.buttonInterval);
        this.buttonInterval = null;
      }
    }
  }

  // ============ Folder Manager with Hidden History ============
  class FolderManager {
    constructor() {
      this.container = null;
      this.dragDropInterval = null;
      this.hiddenHistoryExpanded = false;
      this.hiddenConversations = [];
      this.sidebarConvIds = new Set();
    }

    async init() {
      console.log('📁 Folder Manager initializing...');
      await globalState.loadFolders();
      this.createUI();
      this.injectStyles();
      this.setupDragAndDrop();
      this.setupContextMenus();
    }

    createUI() {
      let insertPoint = null;
      const selectors = ['.history-part', '[class*="history"]', '.sidebar', '[class*="sidebar"]', 'aside'];
      
      for (const selector of selectors) {
        insertPoint = document.querySelector(selector);
        if (insertPoint) break;
      }
      
      if (!insertPoint) {
        setTimeout(() => this.createUI(), 2000);
        return;
      }

      this.container = createElement('div', {
        className: 'kimi-voyager-folders',
        children: [
          // 文件夹头部
          createElement('div', {
            className: 'kimi-voyager-folders-header',
            children: [
              createElement('span', { className: 'kimi-voyager-folders-title', text: '📁 我的文件夹' }),
              createElement('button', {
                className: 'kimi-voyager-folders-add-btn',
                text: '+',
                events: { click: () => this.createFolder() }
              })
            ]
          }),
          // 文件夹列表
          createElement('div', { className: 'kimi-voyager-folders-list' }),
          // 查看更多历史
          createElement('div', {
            className: 'kimi-voyager-hidden-history-section',
            children: [
              createElement('div', {
                className: 'kimi-voyager-hidden-history-header',
                events: { click: () => this.toggleHiddenHistory() },
                children: [
                  createElement('span', { className: 'hidden-history-icon', text: '📂' }),
                  createElement('span', { className: 'hidden-history-title', text: '查看更多历史' }),
                  createElement('span', { className: 'hidden-history-arrow', text: '▶' })
                ]
              }),
              createElement('div', {
                className: 'kimi-voyager-hidden-history-content',
                styles: { display: 'none' }
              })
            ]
          })
        ]
      });

      insertPoint.parentElement.insertBefore(this.container, insertPoint);
      this.renderFolders();
    }

    renderFolders() {
      const list = this.container.querySelector('.kimi-voyager-folders-list');
      list.innerHTML = '';

      if (globalState.folders.length === 0) {
        list.appendChild(createElement('div', {
          className: 'kimi-voyager-folders-empty',
          text: '暂无文件夹，点击 + 创建'
        }));
        return;
      }

      globalState.folders.forEach(folder => {
        const item = createElement('div', {
          className: 'kimi-voyager-folder-item',
          attributes: { 'data-folder-id': folder.id },
          events: {
            dragover: (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              item.classList.add('drag-over');
            },
            dragenter: (e) => {
              e.preventDefault();
              item.classList.add('drag-over');
            },
            dragleave: () => item.classList.remove('drag-over'),
            drop: (e) => this.handleDrop(e, folder, item)
          },
          children: [
            createElement('span', { className: 'folder-icon', text: '📁' }),
            createElement('span', { className: 'folder-name', text: folder.name }),
            createElement('span', {
              className: 'folder-count',
              text: `(${folder.conversations?.length || 0})`
            })
          ]
        });
        list.appendChild(item);
      });
    }

    createFolder() {
      const name = prompt('输入文件夹名称:');
      if (name && name.trim()) {
        globalState.folders.push({
          id: Date.now().toString(),
          name: name.trim(),
          conversations: [],
          createdAt: Date.now()
        });
        globalState.saveFolders();
        this.renderFolders();
        showToast('文件夹创建成功', 'success');
      }
    }

    // ========== Hidden History ==========
    toggleHiddenHistory() {
      this.hiddenHistoryExpanded = !this.hiddenHistoryExpanded;
      
      const content = this.container.querySelector('.kimi-voyager-hidden-history-content');
      const arrow = this.container.querySelector('.hidden-history-arrow');
      
      if (this.hiddenHistoryExpanded) {
        content.style.display = 'block';
        arrow.textContent = '▼';
        if (this.hiddenConversations.length === 0) {
          this.loadHiddenHistory();
        }
      } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
      }
    }

    async loadHiddenHistory() {
      const content = this.container.querySelector('.kimi-voyager-hidden-history-content');
      content.innerHTML = '<div class="hidden-history-loading">加载中...</div>';

      // 获取侧边栏已显示的对话
      this.sidebarConvIds = this.getSidebarConversationIds();
      
      // 尝试从页面数据获取所有历史对话
      const allConversations = await this.fetchAllConversations();
      
      // 过滤掉已在侧边栏显示的（前5条）
      this.hiddenConversations = allConversations.filter(conv => {
        return !this.sidebarConvIds.has(conv.id);
      });

      this.renderHiddenHistory();
    }

    getSidebarConversationIds() {
      const ids = new Set();
      const sidebar = document.querySelector('.sidebar, [class*="sidebar"], aside, nav');
      if (sidebar) {
        const links = sidebar.querySelectorAll('a[href*="/chat/"]');
        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          const match = href.match(/\/chat\/([^/?#]+)/);
          if (match) ids.add(match[1]);
        });
      }
      return ids;
    }

    async fetchAllConversations() {
      const conversations = [];
      
      // 方法1: 尝试从 API 获取完整历史
      try {
        const response = await fetch('/chat/history', {
          method: 'GET',
          headers: { 
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin'
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('📜 /chat/history API 返回:', data);
          
          // 处理不同可能的返回格式
          const convList = data.conversations || data.chats || data.list || data.data || (Array.isArray(data) ? data : []);
          
          convList.forEach(conv => {
            const id = conv.id || conv.chatId || conv.conversationId;
            const title = conv.title || conv.name || conv.subject || '未命名对话';
            if (id && !conversations.find(c => c.id === id)) {
              conversations.push({
                id,
                title,
                href: `/chat/${id}`,
                updatedAt: conv.updatedAt || conv.createTime || Date.now()
              });
            }
          });
          
          if (conversations.length > 0) {
            console.log(`📜 从 API 获取了 ${conversations.length} 条对话`);
            return conversations;
          }
        }
      } catch (e) {
        console.log('📜 /chat/history API 请求失败:', e.message);
      }
      
      // 方法2: 尝试从 localStorage 获取
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.includes('chat') || key.includes('conversation') || key.includes('history')) {
            try {
              const data = JSON.parse(localStorage.getItem(key));
              if (Array.isArray(data)) {
                data.forEach(conv => {
                  const id = conv.id || conv.chatId || conv.conversationId;
                  const title = conv.title || conv.name || conv.subject || '未命名对话';
                  if (id && !conversations.find(c => c.id === id)) {
                    conversations.push({ id, title, href: `/chat/${id}` });
                  }
                });
              } else if (data && typeof data === 'object') {
                // 可能是对象格式
                Object.values(data).forEach(conv => {
                  const id = conv?.id || conv?.chatId;
                  const title = conv?.title || conv?.name || '未命名对话';
                  if (id && !conversations.find(c => c.id === id)) {
                    conversations.push({ id, title, href: `/chat/${id}` });
                  }
                });
              }
            } catch (e) {}
          }
        });
      } catch (e) {}

      // 方法3: 从页面链接获取
      document.querySelectorAll('a[href*="/chat/"]').forEach(link => {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/chat\/([^/?#]+)/);
        if (match) {
          const id = match[1];
          if (id.length > 5 && !conversations.find(c => c.id === id)) { // 过滤掉短ID（可能是路由）
            const title = link.textContent.trim().split('\n')[0] || '未命名对话';
            conversations.push({ id, title, href });
          }
        }
      });

      console.log(`📜 共获取 ${conversations.length} 条对话`);
      return conversations;
    }

    renderHiddenHistory() {
      const content = this.container.querySelector('.kimi-voyager-hidden-history-content');
      content.innerHTML = '';

      if (this.hiddenConversations.length === 0) {
        content.innerHTML = '<div class="hidden-history-empty">暂无更多历史对话</div>';
        return;
      }

      const list = createElement('div', { className: 'hidden-history-list' });

      this.hiddenConversations.forEach(conv => {
        const item = createElement('div', {
          className: 'hidden-history-item',
          attributes: { 'data-conv-id': conv.id, draggable: 'true' },
          events: {
            click: () => { window.location.href = conv.href; },
            contextmenu: (e) => this.showHiddenConvContextMenu(e, conv),
            dragstart: (e) => {
              e.dataTransfer.setData('application/json', JSON.stringify({
                type: 'conversation', id: conv.id, title: conv.title
              }));
              e.dataTransfer.effectAllowed = 'move';
              item.style.opacity = '0.5';
            },
            dragend: () => { item.style.opacity = '1'; }
          },
          children: [
            createElement('span', { className: 'hidden-history-item-icon', text: '💬' }),
            createElement('span', {
              className: 'hidden-history-item-title',
              text: conv.title
            })
          ]
        });
        list.appendChild(item);
      });

      content.appendChild(list);
    }

    showHiddenConvContextMenu(event, conv) {
      event.preventDefault();
      document.querySelectorAll('.kimi-voyager-context-menu').forEach(m => m.remove());

      // 构建文件夹子菜单
      const folderSubmenu = createElement('div', { className: 'submenu-folder-list' });
      
      if (globalState.folders.length === 0) {
        folderSubmenu.appendChild(createElement('div', {
          className: 'submenu-empty',
          text: '暂无文件夹'
        }));
      } else {
        globalState.folders.forEach(folder => {
          folderSubmenu.appendChild(createElement('div', {
            className: 'submenu-folder-item',
            text: `📁 ${folder.name}`,
            events: {
              click: () => {
                if (globalState.addConversationToFolder(conv.id, conv.title, folder.id)) {
                  showToast(`已添加到 "${folder.name}"`, 'success');
                  this.renderFolders();
                } else {
                  showToast('该对话已在文件夹中', 'info');
                }
                menu.remove();
              }
            }
          }));
        });
      }

      const menu = createElement('div', {
        className: 'kimi-voyager-context-menu',
        styles: {
          position: 'fixed',
          left: `${event.clientX}px`,
          top: `${event.clientY}px`,
          zIndex: '999999'
        },
        children: [
          createElement('div', {
            className: 'menu-item has-submenu',
            text: '📁 添加到文件夹',
            children: [folderSubmenu]
          }),
          createElement('div', {
            className: 'menu-item',
            text: '🔗 复制链接',
            events: {
              click: () => {
                const url = `${window.location.origin}/chat/${conv.id}`;
                navigator.clipboard.writeText(url).then(() => {
                  showToast('链接已复制', 'success');
                });
                menu.remove();
              }
            }
          })
        ]
      });

      document.body.appendChild(menu);
      
      // 子菜单交互
      const hasSubmenu = menu.querySelector('.has-submenu');
      if (hasSubmenu) {
        hasSubmenu.addEventListener('mouseenter', () => {
          folderSubmenu.style.display = 'block';
        });
        hasSubmenu.addEventListener('mouseleave', () => {
          folderSubmenu.style.display = 'none';
        });
      }

      setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        });
      }, 0);
    }

    // ========== Drag & Drop ==========
    setupDragAndDrop() {
      let lastChatCount = 0;
      
      const makeItemsDraggable = () => {
        // 查找所有可能包含对话的容器
        const containers = document.querySelectorAll('.sidebar, [class*="sidebar"], aside, nav, [class*="history"], [class*="chat-list"]');
        
        containers.forEach(container => {
          // 查找对话项 - 使用更广泛的选择器
          const chatItems = container.querySelectorAll('a[href*="/chat/"], [class*="chat-item"], [class*="conversation-item"], [data-conv-id]');
          
          chatItems.forEach(item => {
            if (item.dataset.voyagerDraggable === 'true') return;
            
            // 确保 item 有 href 或 data-conv-id
            const href = item.getAttribute('href') || '';
            const convId = item.dataset.convId || (href.match(/\/chat\/([^/?#]+)/) ? href.match(/\/chat\/([^/?#]+)/)[1] : '');
            if (!convId) return;
            
            item.dataset.voyagerDraggable = 'true';
            item.dataset.convId = convId;
            item.draggable = true;
            item.style.cursor = 'grab';
            
            // 提取标题
            let title = '';
            const titleSelectors = ['.chat-name', '[class*="chat-name"]', '.title', '[class*="title"]', '.name', '[class*="name"]'];
            for (const sel of titleSelectors) {
              const titleEl = item.querySelector(sel);
              if (titleEl) { title = titleEl.textContent.trim(); break; }
            }
            if (!title) title = item.textContent.trim().split('\n')[0] || convId;
            item.dataset.convTitle = title;
            
            // 添加拖拽手柄（小圆点）
            if (!item.querySelector('.voyager-drag-handle')) {
              const handle = createElement('div', {
                className: 'voyager-drag-handle',
                title: '拖拽到文件夹收藏',
                styles: {
                  position: 'absolute',
                  left: '2px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '4px',
                  height: '20px',
                  background: 'rgba(79, 70, 229, 0.3)',
                  borderRadius: '2px',
                  cursor: 'grab',
                  opacity: '0',
                  transition: 'opacity 0.2s',
                  zIndex: '10'
                }
              });
              item.style.position = 'relative';
              item.appendChild(handle);
              
              item.addEventListener('mouseenter', () => { handle.style.opacity = '1'; });
              item.addEventListener('mouseleave', () => { handle.style.opacity = '0'; });
            }
            
            item.addEventListener('dragstart', (e) => {
              e.dataTransfer.setData('application/json', JSON.stringify({
                type: 'conversation', id: convId, title
              }));
              e.dataTransfer.effectAllowed = 'move';
              item.style.opacity = '0.6';
              item.classList.add('dragging');
              console.log('📁 Drag started:', title);
            });
            
            item.addEventListener('dragend', () => {
              item.style.opacity = '1';
              item.classList.remove('dragging');
              document.querySelectorAll('.kimi-voyager-folder-item.drag-over').forEach(el => {
                el.classList.remove('drag-over');
              });
            });
            
            // 为每个对话项添加收藏按钮（省略号菜单旁）
            this.addFavoriteButton(item, convId, title);
          });
          
          lastChatCount += chatItems.length;
        });
      };
      
      makeItemsDraggable();
      this.dragDropInterval = setInterval(makeItemsDraggable, 2000);
    }

    addFavoriteButton(item, convId, title) {
      // 避免重复添加
      if (item.querySelector('.voyager-fav-btn')) return;
      
      // 查找是否已有菜单按钮区域
      const menuArea = item.querySelector('[class*="menu"], [class*="more"], [class*="action"]');
      
      const favBtn = createElement('button', {
        className: 'voyager-fav-btn',
        title: '添加到文件夹',
        html: '⭐',
        styles: {
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          padding: '2px 4px',
          borderRadius: '4px',
          opacity: menuArea ? '0' : '0.6',
          transition: 'all 0.2s',
          marginLeft: '4px'
        },
        events: {
          click: (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showFolderSelector(e, convId, title);
          },
          mouseenter: (e) => { e.target.style.opacity = '1'; e.target.style.background = 'rgba(255,255,255,0.1)'; },
          mouseleave: (e) => { e.target.style.opacity = menuArea ? '0' : '0.6'; e.target.style.background = 'none'; }
        }
      });
      
      if (menuArea) {
        menuArea.parentElement.insertBefore(favBtn, menuArea.nextSibling);
        item.addEventListener('mouseenter', () => { favBtn.style.opacity = '0.6'; });
        item.addEventListener('mouseleave', () => { favBtn.style.opacity = '0'; });
      } else {
        item.appendChild(favBtn);
      }
    }

    showFolderSelector(event, convId, title) {
      document.querySelectorAll('.kimi-voyager-folder-selector').forEach(m => m.remove());
      
      const selector = createElement('div', {
        className: 'kimi-voyager-folder-selector',
        styles: {
          position: 'fixed',
          left: `${event.clientX}px`,
          top: `${event.clientY}px`,
          zIndex: '999999'
        }
      });
      
      // 标题
      selector.appendChild(createElement('div', {
        className: 'selector-header',
        text: '添加到文件夹'
      }));
      
      // 文件夹列表
      if (globalState.folders.length === 0) {
        selector.appendChild(createElement('div', {
          className: 'selector-empty',
          text: '暂无文件夹，请先创建'
        }));
      } else {
        globalState.folders.forEach(folder => {
          selector.appendChild(createElement('div', {
            className: 'selector-folder-item',
            text: `📁 ${folder.name}`,
            events: {
              click: () => {
                if (globalState.addConversationToFolder(convId, title, folder.id)) {
                  showToast(`已添加到 "${folder.name}"`, 'success');
                  this.renderFolders();
                } else {
                  showToast('该对话已在文件夹中', 'info');
                }
                selector.remove();
              }
            }
          }));
        });
      }
      
      // 新建文件夹按钮
      selector.appendChild(createElement('div', {
        className: 'selector-new-folder',
        text: '+ 新建文件夹',
        events: {
          click: () => {
            this.createFolder();
            selector.remove();
          }
        }
      }));
      
      document.body.appendChild(selector);
      
      setTimeout(() => {
        document.addEventListener('click', function closeSelector() {
          selector.remove();
          document.removeEventListener('click', closeSelector);
        });
      }, 0);
    }

    setupContextMenus() {
      // 为历史对话项添加右键菜单（通过事件委托）
      document.addEventListener('contextmenu', (e) => {
        const chatLink = e.target.closest('a[href*="/chat/"], [class*="chat-item"], [data-conv-id]');
        if (!chatLink) return;
        
        const sidebar = chatLink.closest('.sidebar, [class*="sidebar"], aside, nav, [class*="history"]');
        if (!sidebar) return;
        
        // 检查是否点击的是已有菜单按钮
        const menuBtn = e.target.closest('[class*="menu"], [class*="more"], button');
        if (menuBtn) return;
        
        // 可以在这里添加自定义右键菜单逻辑
      });
    }

    async handleDrop(e, folder, item) {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove('drag-over');
      
      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
      } catch (err) { return; }
      
      if (data.type === 'conversation' && data.id) {
        if (globalState.addConversationToFolder(data.id, data.title, folder.id)) {
          this.renderFolders();
          showToast(`已添加 "${data.title}" 到文件夹`, 'success');
        } else {
          showToast('该对话已在文件夹中', 'info');
        }
      }
    }

    injectStyles() {
      const style = createElement('style', {
        text: `
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
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .kimi-voyager-folders-add-btn:hover {
            background: #4338ca;
          }
          .kimi-voyager-folders-empty {
            text-align: center;
            color: #9ca3af;
            font-size: 13px;
            padding: 16px;
          }
          .kimi-voyager-folders-list {
            margin-bottom: 12px;
          }
          .kimi-voyager-folder-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            border: 2px dashed transparent;
            margin-bottom: 4px;
          }
          .kimi-voyager-folder-item:hover {
            background: rgba(255, 255, 255, 0.08);
          }
          .kimi-voyager-folder-item.drag-over {
            background: rgba(79, 70, 229, 0.2);
            border-color: #4f46e5;
            transform: scale(1.02);
          }
          .folder-icon { font-size: 16px; }
          .folder-name {
            flex: 1;
            font-size: 14px;
            color: #e5e7eb;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .folder-count { font-size: 12px; color: #6b7280; }

          /* Hidden History Section */
          .kimi-voyager-hidden-history-section {
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            padding-top: 12px;
          }
          .kimi-voyager-hidden-history-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s;
          }
          .kimi-voyager-hidden-history-header:hover {
            background: rgba(255, 255, 255, 0.05);
          }
          .hidden-history-icon { font-size: 14px; }
          .hidden-history-title {
            flex: 1;
            font-size: 13px;
            color: #9ca3af;
          }
          .hidden-history-arrow {
            font-size: 10px;
            color: #6b7280;
            transition: transform 0.2s;
          }
          .kimi-voyager-hidden-history-content {
            padding: 8px 0 8px 24px;
            max-height: 300px;
            overflow-y: auto;
          }
          .kimi-voyager-hidden-history-content::-webkit-scrollbar {
            width: 4px;
          }
          .kimi-voyager-hidden-history-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 2px;
          }
          .hidden-history-loading,
          .hidden-history-empty {
            padding: 12px;
            text-align: center;
            font-size: 12px;
            color: #6b7280;
          }
          .hidden-history-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .hidden-history-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 12px;
            color: #9ca3af;
            draggable: true;
          }
          .hidden-history-item:hover {
            background: rgba(255, 255, 255, 0.05);
            color: #e5e7eb;
          }
          .hidden-history-item-icon { font-size: 12px; }
          .hidden-history-item-title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
          }

          /* Submenu */
          .submenu-folder-list {
            display: none;
            position: absolute;
            left: 100%;
            top: 0;
            background: #374151;
            border-radius: 8px;
            padding: 4px;
            min-width: 150px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          }
          .has-submenu {
            position: relative;
          }
          .has-submenu:hover .submenu-folder-list {
            display: block;
          }
          .submenu-folder-item {
            padding: 8px 12px;
            font-size: 13px;
            color: #e5e7eb;
            cursor: pointer;
            border-radius: 6px;
            white-space: nowrap;
          }
          .submenu-folder-item:hover {
            background: rgba(255, 255, 255, 0.1);
          }
          .submenu-empty {
            padding: 8px 12px;
            font-size: 12px;
            color: #6b7280;
          }

          /* Drag styles */
          a[draggable="true"] { cursor: grab; }
          a[draggable="true"]:active { cursor: grabbing; }
          a[draggable="true"].dragging { opacity: 0.5; }
          
          /* Drag handle */
          .voyager-drag-handle {
            pointer-events: none;
          }
          
          /* Favorite button */
          .voyager-fav-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          
          /* Folder selector popup */
          .kimi-voyager-folder-selector {
            background: rgba(31, 41, 55, 0.98);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 8px;
            min-width: 180px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            animation: selectorFadeIn 0.15s ease;
          }
          
          @keyframes selectorFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          
          .kimi-voyager-folder-selector .selector-header {
            font-size: 12px;
            font-weight: 600;
            color: #9ca3af;
            padding: 8px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 4px;
          }
          
          .kimi-voyager-folder-selector .selector-empty {
            padding: 12px;
            font-size: 13px;
            color: #6b7280;
            text-align: center;
          }
          
          .kimi-voyager-folder-selector .selector-folder-item {
            padding: 10px 12px;
            font-size: 13px;
            color: #e5e7eb;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s;
            white-space: nowrap;
          }
          
          .kimi-voyager-folder-selector .selector-folder-item:hover {
            background: rgba(79, 70, 229, 0.2);
            color: #fff;
          }
          
          .kimi-voyager-folder-selector .selector-new-folder {
            padding: 10px 12px;
            font-size: 13px;
            color: #4f46e5;
            cursor: pointer;
            border-radius: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            margin-top: 4px;
            font-weight: 500;
          }
          
          .kimi-voyager-folder-selector .selector-new-folder:hover {
            background: rgba(79, 70, 229, 0.1);
          }
        `
      });
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
    }
  }

  // ============ Main KimiVoyager Class ============
  class KimiVoyager {
    constructor() {
      this.initialized = false;
      this.features = {};
      this.visualEffects = new VisualEffects();
    }

    async init() {
      if (this.initialized) return;
      
      console.log('🚀 Kimi Voyager v1.0.0-Modified initializing...');
      const url = window.location.href;
      const isChatPage = url.includes('/chat');
      
      console.log('📍 URL:', url, 'isChatPage:', isChatPage);

      if (isChatPage) {
        this.features.timeline = new Timeline();
        this.features.timeline.init();

        this.features.exportManager = new ExportManager();
        this.features.exportManager.init();

        this.features.folderManager = new FolderManager();
        await this.features.folderManager.init();

        // 默认无视觉效果
        this.visualEffects.init('none');
      }

      this.initialized = true;
      console.log('✅ Kimi Voyager initialized');
    }

    setVisualEffect(type) {
      console.log('🎨 Setting visual effect:', type);
      globalState.visualEffect = type;
      this.visualEffects.setType(type);
      showToast(`视觉效果: ${type === 'none' ? '无' : type === 'snow' ? '雪花' : type === 'sakura' ? '樱花' : '雨滴'}`, 'success');
    }
  }

  // ============ Initialize ============
  const voyager = new KimiVoyager();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => voyager.init());
  } else {
    voyager.init();
  }

  // Handle URL changes
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => voyager.init(), 1000);
    }
  }, 1000);

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Content script received message:', request.action);
    
    switch (request.action) {
      case 'applyVisualEffect':
        if (voyager) {
          voyager.setVisualEffect(request.effect);
          sendResponse({ success: true });
        }
        break;
      case 'toggleFeature':
        // Handle feature toggle
        sendResponse({ success: true });
        break;
      case 'getConversationData':
        // Return conversation data for export
        const messages = [];
        document.querySelectorAll('.chat-content-item, [class*="chat-content-item"]').forEach(el => {
          const isUser = el.className.includes('user') || el.querySelector('.user-content') !== null;
          const contentEl = el.querySelector('.user-content, .markdown') || el;
          messages.push({
            role: isUser ? 'user' : 'assistant',
            content: contentEl.textContent.trim()
          });
        });
        sendResponse({ 
          success: true, 
          data: { 
            title: document.title.replace(' - Kimi', ''), 
            messages 
          }
        });
        break;
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true; // Keep channel open for async
  });

  // Expose to window for popup communication
  window.kimiVoyager = voyager;

})();
