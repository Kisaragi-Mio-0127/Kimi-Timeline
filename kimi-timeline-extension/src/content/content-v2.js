/**
 * Kimi-Timeline - Content Script
 * 版本: 1.1.0
 */

(function() {
  'use strict';

  // ============ Global Network Interceptor (must run before any fetch) ============
  window.__kimiVoyagerInterceptedData = window.__kimiVoyagerInterceptedData || [];
  window.__kimiVoyagerInterceptedMessages = window.__kimiVoyagerInterceptedMessages || [];
  
  // 从 API 响应中提取用户消息（FolderManager 式宽松解析）
  function extractUserMessagesFromData(data) {
    const messages = [];
    if (!data) return messages;
    
    // 尝试 10+ 种常见字段路径
    const possibleLists = [
      data.messages,
      data.conversation?.messages,
      data.data?.messages,
      data.chat?.messages,
      data.currentChat?.messages,
      data.items,
      data.list,
      data.results,
      Array.isArray(data) ? data : null
    ];
    
    for (const list of possibleLists) {
      if (!Array.isArray(list)) continue;
      for (const msg of list) {
        if (!msg) continue;
        const role = msg.role || msg.sender || msg.type;
        const content = msg.content || msg.text || msg.message || msg.body;
        if (role === 'user' && content) {
          let text = '';
          if (typeof content === 'string') {
            text = content;
          } else if (Array.isArray(content)) {
            // OpenAI 格式: [{type:'text',text:'...'}] 或 [{type:'image_url',...}]
            text = content.map(c => c.text || c.value || '').join('');
          } else {
            text = content.text || content.parts?.join('') || JSON.stringify(content);
          }
          if (text && text.trim()) messages.push(text.trim());
        }
      }
    }
    return messages;
  }
  
  if (!window.__kimiVoyagerFetchHooked) {
    window.__kimiVoyagerFetchHooked = true;
    
    const _origFetch = window.fetch;
    window.fetch = async function(...args) {
      const [url, options] = args;
      const urlStr = typeof url === 'string' ? url : (url?.url || url?.toString?.() || '');
      try {
        const resp = await _origFetch.apply(this, args);
        try {
          // 只处理成功的 JSON 响应，避免在错误响应上浪费资源
          if (resp.ok) {
            const ct = resp.headers.get('content-type') || '';
            if (ct.includes('json')) {
              const clone = resp.clone();
              clone.json().then(data => {
                const isChatApi = /\/(api\/)?(chat|conversation)s?(\/|list|history|\?|$)/i.test(urlStr);
                if (isChatApi && data) {
                  window.__kimiVoyagerInterceptedData.push(data);
                  // 实时提取消息，供 Timeline 直接使用
                  const msgs = extractUserMessagesFromData(data);
                  if (msgs.length > 0) {
                    window.__kimiVoyagerInterceptedMessages.push(...msgs);
                  }
                }
              }).catch(() => {});
            }
          }
        } catch (e) {}
        return resp;
      } catch (e) {
        // 修复：请求失败时直接抛出错误，不再重复发送请求
        throw e;
      }
    };
    
    const _origXHROpen = XMLHttpRequest.prototype.open;
    const _origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._voyagerUrl = url;
      return _origXHROpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(...sArgs) {
      // 修复：避免对同一个 XHR 实例重复添加 load 监听器
      if (!this._voyagerLoadHooked) {
        this._voyagerLoadHooked = true;
        this.addEventListener('load', function() {
          try {
            const url = this._voyagerUrl || '';
            const isChatApi = /\/(api\/)?(chat|conversation)s?(\/|list|history|\?|$)/i.test(url);
            if (isChatApi && this.responseText) {
              const data = JSON.parse(this.responseText);
              window.__kimiVoyagerInterceptedData.push(data);
              // 实时提取消息
              const msgs = extractUserMessagesFromData(data);
              if (msgs.length > 0) {
                window.__kimiVoyagerInterceptedMessages.push(...msgs);
              }
            }
          } catch (e) {}
        });
      }
      return _origXHRSend.apply(this, sArgs);
    };
  }

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
        if (!chrome.runtime?.id) return this.folders;
        const response = await chrome.storage.local.get('folders');
        this.folders = response.folders || [];
      } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
          console.warn('⚠️ Extension context invalidated in loadFolders');
        }
        this.folders = [];
      }
      return this.folders;
    },
    
    async saveFolders() {
      try {
        if (!chrome.runtime?.id) return;
        await chrome.storage.local.set({ folders: this.folders });
      } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
          console.warn('⚠️ Extension context invalidated in saveFolders');
        } else {
          console.error('Save folders error:', error);
        }
      }
    },
    
    moveConversationToFolder(convId, convTitle, folderId) {
      // 递归查找文件夹
      const findFolder = (folders, id) => {
        for (const f of folders) {
          if (f.id === id) return f;
          if (f.children) {
            const found = findFolder(f.children, id);
            if (found) return found;
          }
        }
        return null;
      };
      
      // 递归从所有文件夹中移除对话
      const removeConv = (folders) => {
        folders.forEach(f => {
          if (f.conversations) {
            f.conversations = f.conversations.filter(c => c.id !== convId);
          }
          if (f.children) removeConv(f.children);
        });
      };
      
      const targetFolder = findFolder(this.folders, folderId);
      if (!targetFolder) return false;
      if (!targetFolder.conversations) targetFolder.conversations = [];
      
      // 如果已在目标文件夹，无需移动
      if (targetFolder.conversations.find(c => c.id === convId)) return false;
      
      // 先从所有文件夹（包括子文件夹）中移除该对话（确保唯一）
      removeConv(this.folders);
      
      targetFolder.conversations.push({
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
      this.dragOffsetX = 0;
      this.dragOffsetY = 0;
      this.updateInterval = null;
      this.preview = null;
      this.starredTexts = new Set();
      this.scrollObserver = null;
      this.scrollContainer = null;
      this.scrollHandler = null;
      this.ACTIVATE_AHEAD = 120; // 提前激活距离（像素）
      this._isNavigating = false;
      this._navigateTimer = null;
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
      
      const startDrag = (clientX, clientY) => {
        this.isDragging = true;
        const rect = this.container.getBoundingClientRect();
        this.dragOffsetX = clientX - rect.left;
        this.dragOffsetY = clientY - rect.top;
        this.container.style.cursor = 'grabbing';
        // 关键修复：先将当前视觉位置固定为像素值，再清除 transform，避免跳动
        this.container.style.right = 'auto';
        this.container.style.bottom = 'auto';
        this.container.style.left = rect.left + 'px';
        this.container.style.top = rect.top + 'px';
        this.container.style.transform = 'none';
      };
      
      const onMove = (clientX, clientY) => {
        if (!this.isDragging) return;
        let newLeft = clientX - this.dragOffsetX;
        let newTop = clientY - this.dragOffsetY;
        const maxLeft = window.innerWidth - this.container.offsetWidth;
        const maxTop = window.innerHeight - this.container.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));
        this.container.style.left = newLeft + 'px';
        this.container.style.top = newTop + 'px';
        this.container.style.right = 'auto';
      };
      
      const endDrag = () => {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.container.style.cursor = 'default';
      };
      
      dragHandle.addEventListener('mousedown', (e) => {
        startDrag(e.clientX, e.clientY);
        e.preventDefault();
      });
      
      document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
      document.addEventListener('mouseup', endDrag);
      
      // Touch support for mobile
      dragHandle.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        startDrag(touch.clientX, touch.clientY);
      }, { passive: false });
      
      document.addEventListener('touchmove', (e) => {
        if (!this.isDragging) return;
        const touch = e.touches[0];
        onMove(touch.clientX, touch.clientY);
      }, { passive: false });
      
      document.addEventListener('touchend', endDrag);
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
      
      // 尝试从页面全局变量或拦截器获取补充消息（仿照 chat/history 的多源获取逻辑）
      const apiMessages = this.fetchMessagesFromAPI();
      
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
      
      // 如果 API 数据有更多消息但 DOM 还没渲染完，补充占位（等 DOM 更新后会自动替换）
      if (apiMessages.length > userMessages.length) {
        for (let i = userMessages.length; i < apiMessages.length; i++) {
          userMessages.push({
            index: i,
            element: null,
            originalIndex: -1,
            displayText: apiMessages[i].length > 60 ? apiMessages[i].substring(0, 60) + '...' : apiMessages[i],
            fullText: apiMessages[i]
          });
        }
      }
      
      const hasChanged = userMessages.length !== this.messages.length ||
        userMessages.some((m, i) => this.messages[i] && m.fullText !== this.messages[i].fullText);
      
      if (hasChanged) {
        // DOM 可能重构，清除滚动容器缓存和 offsetTop 缓存
        this.scrollContainer = null;
        this.messages = userMessages;
        this.messages.forEach(m => { m.offsetTop = undefined; });
        this.renderTimeline();
        this.renderPromptList();
        // 重新绑定滚动监听（如果 scrollContainer 变了）
        this._attachScrollListener();
        this.updateCurrentIndex();
      } else {
        // 即使文本内容未变，React/Vue 可能已重新渲染 DOM，需要刷新 element 引用
        userMessages.forEach((msg, i) => {
          if (this.messages[i] && msg.element) {
            this.messages[i].element = msg.element;
            this.messages[i].offsetTop = undefined; // DOM 变了，offsetTop 需重新计算
          }
        });
      }
    }
    
    fetchMessagesFromAPI() {
      const messages = [];
      const seen = new Set();
      
      try {
        // 方法1: 从专门的消息缓存中获取（网络拦截器实时提取）
        const cached = window.__kimiVoyagerInterceptedMessages;
        if (cached && cached.length > 0) {
          cached.forEach(text => {
            if (text && !seen.has(text)) {
              seen.add(text);
              messages.push(text);
            }
          });
        }
      } catch (e) {}
      
      try {
        // 方法2: 从通用拦截数据中解析（兜底）
        const pending = window.__kimiVoyagerInterceptedData;
        if (pending && pending.length > 0) {
          pending.forEach(data => {
            const msgs = extractUserMessagesFromData(data);
            msgs.forEach(text => {
              if (text && !seen.has(text)) {
                seen.add(text);
                messages.push(text);
              }
            });
          });
        }
      } catch (e) {}
      
      try {
        // 方法3: 从页面全局变量获取
        const globalKeys = ['__INITIAL_STATE__', '__DATA__', '__APP__', '_KIMI_DATA', 'kimiData'];
        for (const gk of globalKeys) {
          const globalData = window[gk];
          if (globalData) {
            const msgs = extractUserMessagesFromData(globalData);
            msgs.forEach(text => {
              if (text && !seen.has(text)) {
                seen.add(text);
                messages.push(text);
              }
            });
            if (messages.length > 0) break;
          }
        }
      } catch (e) {}
      
      return messages;
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
        const isStarred = this.starredTexts.has(msg.fullText);
        const node = createElement('div', {
          className: `kimi-voyager-timeline-node ${index === this.currentIndex ? 'active' : ''} ${isStarred ? 'starred' : ''}`,
          attributes: { 'data-index': index, title: isStarred ? '⭐ 已星标' : '' },
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
        const isStarred = this.starredTexts.has(msg.fullText);
        const item = createElement('div', {
          className: `kimi-voyager-prompt-item ${index === this.currentIndex ? 'active' : ''} ${isStarred ? 'starred' : ''}`,
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
              text: (isStarred ? '⭐ ' : '') + (msg.displayText || '(空消息)')
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
            text: this.starredTexts.has(msg.fullText) ? '❌ 取消星标' : '⭐ 添加星标',
            events: {
              click: () => {
                this.toggleStar(msg);
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

    toggleStar(msg) {
      if (this.starredTexts.has(msg.fullText)) {
        this.starredTexts.delete(msg.fullText);
        showToast('已取消星标', 'success');
      } else {
        this.starredTexts.add(msg.fullText);
        showToast('已添加星标', 'success');
      }
      this.renderTimeline();
      this.renderPromptList();
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

    findScrollContainer() {
      if (this.scrollContainer) return this.scrollContainer;
      
      // 策略1：从第一个消息元素向上遍历，找到 overflowY 为 auto/scroll 的父元素（最可靠）
      const firstMsg = this.messages.find(m => m.element)?.element;
      if (firstMsg) {
        let parent = firstMsg.parentElement;
        while (parent && parent !== document.body) {
          const style = window.getComputedStyle(parent);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            this.scrollContainer = parent;
            return parent;
          }
          parent = parent.parentElement;
        }
      }
      
      // 策略2：通过常见选择器查找可滚动容器
      const selectors = [
        '.chat-content-list',
        'main',
        '[class*="chat-content"]',
        '[class*="conversation"]',
        '[class*="message-list"]'
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          const style = window.getComputedStyle(el);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            this.scrollContainer = el;
            return el;
          }
        }
      }
      
      // 最终兜底：document 级别的滚动
      this.scrollContainer = document.scrollingElement || document.documentElement || document.body;
      return this.scrollContainer;
    }
    
    computeOffsetTop(element, container) {
      if (!element || !container) return 0;
      const elemRect = element.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      return elemRect.top - contRect.top + (container.scrollTop || 0);
    }

    setupScrollHandler() {
      // 使用 requestAnimationFrame 节流，比 throttle(setTimeout) 更流畅
      let scrollRafId = null;
      this.scrollHandler = () => {
        if (scrollRafId !== null) return;
        scrollRafId = requestAnimationFrame(() => {
          scrollRafId = null;
          this.updateCurrentIndex();
        });
      };
      
      // 绑定 window 滚动（作为后备）
      window.addEventListener('scroll', this.scrollHandler, { passive: true });
      
      // 尝试找到并绑定正确的滚动容器
      this._attachScrollListener();
      
      // 监听 DOM 变化：重新发现滚动容器并同步激活状态
      this.scrollObserver = new MutationObserver(() => {
        if (this.scrollContainer && !this.scrollContainer.isConnected) {
          this.scrollContainer = null;
        }
        this._attachScrollListener();
        this.updateCurrentIndex();
      });
      this.scrollObserver.observe(document.body, { childList: true, subtree: true });
    }
    
    _attachScrollListener() {
      const container = this.findScrollContainer();
      if (container && !container._voyagerScrollBound) {
        container._voyagerScrollBound = true;
        container.addEventListener('scroll', this.scrollHandler, { passive: true });
        console.log('🕐 Timeline: scroll listener attached to', container.tagName, container.className?.slice(0, 50));
      }
    }

    updateCurrentIndex() {
      if (this.messages.length === 0) return;
      if (this._isNavigating) return; // 导航滚动期间不更新高亮
      
      const container = this.findScrollContainer();
      if (!container) return;
      
      const scrollTop = container.scrollTop || 0;
      let activeIndex = 0;
      let foundValid = false;
      
      // 核心逻辑（仿照 houyanchao/Timeline）：
      // 找最后一个 offsetTop <= scrollTop + ACTIVATE_AHEAD 的节点
      for (let i = 0; i < this.messages.length; i++) {
        const msg = this.messages[i];
        if (!msg.element || !msg.element.isConnected) continue;
        
        const offsetTop = msg.offsetTop ?? this.computeOffsetTop(msg.element, container);
        if (msg.offsetTop === undefined) msg.offsetTop = offsetTop;
        
        if ((offsetTop - this.ACTIVATE_AHEAD) <= scrollTop) {
          activeIndex = i;
          foundValid = true;
        } else {
          break;
        }
      }
      
      if (!foundValid) return;

      if (activeIndex !== this.currentIndex) {
        this.currentIndex = activeIndex;
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
        if (msg.element) {
          this._isNavigating = true;
          clearTimeout(this._navigateTimer);
          msg.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // 平滑滚动期间忽略 scroll 事件导致的索引更新，避免高亮跳回上一个
          this._navigateTimer = setTimeout(() => {
            this._isNavigating = false;
          }, 600);
        }
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

          .kimi-voyager-prompt-item.starred {
            background: rgba(251, 191, 36, 0.1);
          }

          .kimi-voyager-prompt-item.starred .prompt-item-text {
            color: #fbbf24;
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

          .kimi-voyager-timeline-node.starred {
            background: #fbbf24;
            box-shadow: 0 0 6px rgba(251, 191, 36, 0.6);
          }

          .kimi-voyager-timeline-node.starred.active {
            background: #fbbf24;
            box-shadow: 0 0 10px rgba(251, 191, 36, 0.8);
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
      if (this._navigateTimer) {
        clearTimeout(this._navigateTimer);
        this._navigateTimer = null;
      }
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
      }
      if (this.scrollHandler) {
        window.removeEventListener('scroll', this.scrollHandler);
        if (this.scrollContainer) {
          this.scrollContainer.removeEventListener('scroll', this.scrollHandler);
        }
        this.scrollHandler = null;
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
        
        if (header === lastHeader && header?.querySelector('.kimi-timeline-export-btn')) return;
        lastHeader = header;
        
        if (header && !header.querySelector('.kimi-timeline-export-btn')) {
          const button = createElement('button', {
            className: 'kimi-timeline-export-btn',
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
          .kimi-timeline-export-btn {
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
          .kimi-timeline-export-btn:hover {
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
      this.currentDrag = null;
      this.lastRightClickedConv = null;
      this.historyLoaded = false;
      this.folderDropTargetIndex = undefined;
      this.mouseDrag = null; // 自定义鼠标拖曳状态
      this._dragState = null; // 全局拖拽状态（用于跨区域拖拽视觉反馈）
      this._currentDropTarget = null;
      this._dropPosition = null;
      // 拦截数据轮询相关
      this.interceptedDataPollInterval = null;
      this.lastProcessedInterceptedIndex = 0;
      this.autoLoadAttempts = 0;
      this._foldersRendered = false;
    }

    async init() {
      console.log('📁 Folder Manager initializing...');
      await globalState.loadFolders();
      this.createUI();
      this.injectStyles();
      this.setupDragAndDrop();
      this.setupGlobalLongPressDrag(); // 全局长按拖拽
      this.observeNativeMenus();
      // 处理全局拦截器在 FolderManager 初始化之前已捕获的数据
      this.processPendingInterceptedData();
      // 启动持续监听新拦截数据
      this.startInterceptedDataPolling();
      // 后台自动加载历史对话
      this.autoLoadHistory();
      // 在历史对话页面尝试点击"查看全部"触发更多加载
      if (location.pathname.includes('/chat/history')) {
        setTimeout(() => this.triggerLoadMoreOnHistoryPage(), 1500);
      }
    }

    createUI() {
      // 防止重复创建：如果已有容器且仍在DOM中，直接返回
      if (this.container && this.container.isConnected) {
        return;
      }
      // 清理可能残留的旧容器
      if (this.container) {
        this.container.remove();
        this.container = null;
      }
      document.querySelectorAll('.kimi-voyager-folders').forEach(el => el.remove());

      let insertPoint = null;
      let matchedSelector = '';
      const selectors = [
        '.history-part', '[class*="history-part"]', '[class*="history_list"]',
        '.sidebar', '[class*="sidebar"]', '[class*="side-bar"]',
        'aside', '[class*="sidenav"]', '[class*="navigation"]', 'nav'
      ];
      
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) continue;
        // 验证元素是否看起来像侧边栏（在视口左侧、有足够高度），避免匹配顶部导航栏
        const rect = el.getBoundingClientRect();
        const isLeftSide = rect.left < window.innerWidth / 2;
        const hasHeight = rect.height > 100;
        const isVisible = rect.width > 0 && rect.height > 0;
        if (isLeftSide && hasHeight && isVisible) {
          insertPoint = el;
          matchedSelector = selector;
          console.log(`📁 FolderManager: Found insert point with selector: ${selector}`, el, rect);
          break;
        } else {
          console.log(`📁 FolderManager: Selector "${selector}" matched but rejected (left=${Math.round(rect.left)}, height=${Math.round(rect.height)}, visible=${isVisible})`);
        }
      }
      
      if (!insertPoint) {
        // 使用 MutationObserver + setInterval 双重 fallback 持续查找
        if (!this._uiObserver) {
          console.log('📁 FolderManager: Sidebar not found, starting MutationObserver + interval to wait for it...');
          this._uiObserver = new MutationObserver(() => {
            if (this.container && this.container.isConnected) return;
            this.createUI();
          });
          this._uiObserver.observe(document.body, { childList: true, subtree: true });
        }
        if (!this._uiRetryInterval) {
          this._uiRetryInterval = setInterval(() => {
            if (this.container && this.container.isConnected) {
              this._clearUICreationRetries();
              return;
            }
            this.createUI();
          }, 1500);
        }
        return;
      }

      this._clearUICreationRetries();

      // 确保样式已注入（防御性：防止 observer 后续调用时样式丢失）
      if (!document.querySelector('style[data-kv-folder-styles]')) {
        this.injectStyles();
      }

      this.container = createElement('div', {
        className: 'kimi-voyager-folders',
        styles: {
          marginBottom: '16px',
          padding: '12px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#e5e7eb',
          fontSize: '14px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        },
        children: [
          createElement('div', {
            className: 'kimi-voyager-folders-header',
            styles: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px'
            },
            children: [
              createElement('span', { className: 'kimi-voyager-folders-title', text: '📁 我的文件夹', styles: { fontWeight: '600', fontSize: '14px', color: '#e5e7eb' } }),
              createElement('div', {
                className: 'kimi-voyager-folders-actions',
                styles: { display: 'flex', alignItems: 'center', gap: '6px' },
                children: [
                  createElement('button', {
                    className: 'kimi-voyager-folders-menu-btn',
                    text: '⋮',
                    styles: {
                      width: '24px',
                      height: '24px',
                      border: 'none',
                      background: 'rgba(255,255,255,0.1)',
                      color: '#e5e7eb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    },
                    events: { click: (e) => this.showFolderMenu(e) }
                  }),
                  createElement('button', {
                    className: 'kimi-voyager-folders-add-btn',
                    text: '+',
                    styles: {
                      width: '24px',
                      height: '24px',
                      border: 'none',
                      background: '#4f46e5',
                      color: 'white',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    },
                    events: { click: () => this.createFolder() }
                  })
                ]
              })
            ]
          }),
          createElement('div', { className: 'kimi-voyager-folders-list' }),
          createElement('div', {
            className: 'kimi-voyager-hidden-history-section',
            children: [
              createElement('div', {
                className: 'kimi-voyager-hidden-history-header',
                styles: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', cursor: 'pointer' },
                events: { click: () => this.toggleHiddenHistory() },
                children: [
                  createElement('span', { className: 'hidden-history-title', text: '📂 所有对话', styles: { flex: '1', fontSize: '13px' } }),
                  createElement('span', { className: 'hidden-history-count', text: '', styles: { fontSize: '12px', color: '#6b7280' } }),
                  createElement('span', { className: 'hidden-history-arrow', text: '▶', styles: { fontSize: '10px', color: '#6b7280' } })
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

      // 稳定插入：优先在历史区域之前插入；否则在 sidebar 顶部，最后 fallback 到 append
      if (insertPoint) {
        const historyLike = insertPoint.matches?.('[class*="history"], .history-part') || insertPoint.className?.includes('history');
        if (historyLike && insertPoint.parentElement && insertPoint.parentElement.contains(insertPoint)) {
          try {
            insertPoint.parentElement.insertBefore(this.container, insertPoint);
          } catch (e) {
            console.warn('📁 insertBefore failed, falling back to prepend:', e.message);
            insertPoint.prepend?.(this.container) || insertPoint.appendChild(this.container);
          }
        } else {
          // insertPoint 是 sidebar/aside/nav 等容器：在其内部查找历史区域
          const innerHistory = insertPoint.querySelector('.history-part, [class*="history"]');
          const innerParent = innerHistory?.parentNode;
          if (innerHistory && innerParent && innerParent !== this.container && innerParent.contains(innerHistory)) {
            try {
              innerParent.insertBefore(this.container, innerHistory);
            } catch (e) {
              console.warn('📁 insertBefore (innerHistory) failed, falling back to prepend:', e.message);
              insertPoint.prepend?.(this.container) || insertPoint.appendChild(this.container);
            }
          } else {
            insertPoint.prepend?.(this.container) || insertPoint.appendChild(this.container);
          }
        }
      } else if (document.body) {
        document.body.appendChild(this.container);
      }
      this.renderFolders();
    }

    async renderFolders() {
      if (!this.container) return;
      const list = this.container.querySelector('.kimi-voyager-folders-list');
      if (!list) return;
      list.innerHTML = '';

      // 防御性：首次渲染且文件夹为空时，尝试重新加载一次
      if (globalState.folders.length === 0 && !this._foldersRendered) {
        this._foldersRendered = true;
        await globalState.loadFolders();
        if (globalState.folders.length > 0) {
          return this.renderFolders();
        }
      }
      this._foldersRendered = true;

      if (globalState.folders.length === 0) {
        list.appendChild(createElement('div', {
          className: 'kimi-voyager-folders-empty',
          text: '暂无文件夹，点击 + 创建'
        }));
        return;
      }

      const renderFolder = (folder, depth = 0) => {
        const isExpanded = !!folder.expanded;
        const arrow = (folder.conversations?.length || folder.children?.length) ? (isExpanded ? '▼' : '▶') : '';

        const convList = createElement('div', { className: 'folder-conv-list' });
        const currentConvId = location.pathname.match(/\/chat\/([^/?#]+)/)?.[1] || '';
        (folder.conversations || []).forEach((conv, index) => {
          const isActive = currentConvId && conv.id === currentConvId;
          const convItem = createElement('div', {
            className: 'folder-conv-item' + (isActive ? ' active' : ''),
            attributes: { 'data-conv-id': conv.id, 'data-index': index, draggable: 'true' },
            events: {
              dragstart: (e) => this.handleFolderConvDragStart(e, folder, conv, index),
              dragend: () => this.handleFolderConvDragEnd(),
              click: () => { window.location.href = `/chat/${conv.id}`; },
              contextmenu: (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showConvContextMenu(e, conv, folder);
              }
            },
            children: [
              createElement('span', { className: 'folder-conv-drag-handle', text: '⋮⋮' }),
              createElement('span', { className: 'folder-conv-icon', text: '💬' }),
              createElement('span', {
                className: 'folder-conv-title',
                text: conv.title || '未命名对话'
              })
            ]
          });
          convList.appendChild(convItem);
        });

        // Render child folders inside the content area
        const childList = createElement('div', { className: 'folder-child-list' });
        if (folder.children?.length > 0) {
          folder.children.forEach(child => {
            childList.appendChild(renderFolder(child, depth + 1));
          });
        }

        const dropIndicator = createElement('div', { className: 'folder-drop-indicator' });
        convList.appendChild(dropIndicator);

        const contentArea = createElement('div', {
          className: 'folder-content',
          styles: { display: isExpanded ? 'block' : 'none', marginLeft: `${depth * 12}px` }
        });
        contentArea.appendChild(convList);
        if (folder.children?.length > 0) {
          contentArea.appendChild(childList);
        }

        contentArea.addEventListener('dragover', (e) => this.handleFolderContentDragOver(e, folder, contentArea));
        contentArea.addEventListener('dragleave', (e) => this.handleFolderContentDragLeave(e, contentArea));
        contentArea.addEventListener('drop', (e) => this.handleFolderContentDrop(e, folder, contentArea));

        const header = createElement('div', {
          className: 'folder-header',
          styles: { paddingLeft: `${depth * 12}px` },
          events: {
            click: () => this.toggleFolder(folder),
            contextmenu: (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.showFolderContextMenu(e, folder);
            }
          },
          children: [
            createElement('span', { className: 'folder-arrow', text: arrow }),
            createElement('span', { className: 'folder-icon', text: '📁' }),
            createElement('span', { className: 'folder-name', text: folder.name }),
            createElement('span', {
              className: 'folder-count',
              text: `(${folder.conversations?.length || 0})`
            })
          ]
        });

        const item = createElement('div', {
          className: `kimi-voyager-folder-item${isExpanded ? ' expanded' : ''}`,
          attributes: { 'data-folder-id': folder.id },
          events: {
            dragover: (e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              if (this._dragState?.type === 'conversation') {
                const alreadyInFolder = folder.conversations?.some(c => c.id === this._dragState.id);
                if (alreadyInFolder) {
                  this._clearDropIndicator();
                  return;
                }
              }
              this._setDropIndicator(item, 'inside');
            },
            dragenter: (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (this._dragState?.type === 'conversation') {
                const alreadyInFolder = folder.conversations?.some(c => c.id === this._dragState.id);
                if (alreadyInFolder) return;
              }
              this._setDropIndicator(item, 'inside');
            },
            dragleave: (e) => {
              e.stopPropagation();
              if (!item.contains(e.relatedTarget)) {
                this._clearDropIndicator();
              }
            },
            drop: (e) => {
              e.stopPropagation();
              this.handleDrop(e, folder, item);
            }
          },
          children: [header, contentArea]
        });

        return item;
      };

      globalState.folders.forEach(folder => {
        list.appendChild(renderFolder(folder));
      });
    }

    updateActiveHighlights() {
      if (!this.container) return;
      const currentConvId = location.pathname.match(/\/chat\/([^/?#]+)/)?.[1] || '';
      
      // Update folder conversation items
      this.container.querySelectorAll('.folder-conv-item').forEach(item => {
        const convId = item.dataset.convId;
        item.classList.toggle('active', !!(currentConvId && convId === currentConvId));
      });
      
      // Update hidden history items
      this.container.querySelectorAll('.hidden-history-item').forEach(item => {
        const convId = item.dataset.convId;
        item.classList.toggle('active', !!(currentConvId && convId === currentConvId));
      });
    }

    toggleFolder(folder) {
      folder.expanded = !folder.expanded;
      this.renderFolders();
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

    showFolderMenu(event) {
      event.stopPropagation();
      document.querySelectorAll('.kimi-voyager-folder-menu').forEach(m => m.remove());

      const menu = createElement('div', {
        className: 'kimi-voyager-folder-menu',
        styles: {
          position: 'fixed',
          left: `${event.clientX}px`,
          top: `${event.clientY}px`,
          zIndex: '999999'
        },
        children: [
          createElement('div', {
            className: 'menu-item',
            text: '📥 导出文件夹到 JSON',
            events: {
              click: (e) => {
                e.stopPropagation();
                this.exportFolders();
                menu.remove();
              }
            }
          }),
          createElement('div', {
            className: 'menu-item',
            text: '📤 从 JSON 导入文件夹',
            events: {
              click: (e) => {
                e.stopPropagation();
                this.importFolders();
                menu.remove();
              }
            }
          })
        ]
      });
      document.body.appendChild(menu);

      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('mousedown', closeMenu, true);
        }
      };
      requestAnimationFrame(() => {
        document.addEventListener('mousedown', closeMenu, true);
      });
    }

    exportFolders() {
      try {
        const data = JSON.stringify(globalState.folders, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kimi-folders-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('文件夹已导出', 'success');
      } catch (err) {
        console.error('导出失败:', err);
        showToast('导出失败', 'error');
      }
    }

    async importFolders() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!Array.isArray(data)) {
            showToast('文件格式错误：必须是文件夹数组', 'error');
            return;
          }
          const action = confirm(
            `检测到 ${data.length} 个文件夹。\n点击「确定」替换现有文件夹。\n点击「取消」合并到现有文件夹。`
          );
          if (action) {
            globalState.folders = data;
          } else {
            globalState.folders = [...globalState.folders, ...data];
          }
          await globalState.saveFolders();
          this.renderFolders();
          showToast(`成功导入 ${data.length} 个文件夹`, 'success');
        } catch (err) {
          console.error('导入失败:', err);
          showToast('导入失败：' + err.message, 'error');
        }
      };
      input.click();
    }

    showFolderContextMenu(event, folder) {
      event.preventDefault();
      event.stopPropagation();
      document.querySelectorAll('.kimi-voyager-context-menu').forEach(m => m.remove());

      const removeMenu = () => {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu, true);
        document.removeEventListener('keydown', closeOnEsc, true);
      };

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
            text: '✏️ 重命名',
            events: {
              click: (e) => {
                e.stopPropagation();
                const newName = prompt('输入新名称:', folder.name);
                if (newName && newName.trim() && newName !== folder.name) {
                  folder.name = newName.trim();
                  globalState.saveFolders();
                  this.renderFolders();
                }
                removeMenu();
              }
            }
          }),
          createElement('div', {
            className: 'menu-item',
            text: '🎨 更改颜色',
            events: {
              click: (e) => {
                e.stopPropagation();
                const colors = ['#4f46e5', '#ef4444', '#f97316', '#10b981', '#3b82f6', '#8b5cf6'];
                const currentIndex = colors.indexOf(folder.color);
                folder.color = colors[(currentIndex + 1) % colors.length] || colors[0];
                globalState.saveFolders();
                this.renderFolders();
                removeMenu();
              }
            }
          }),
          createElement('div', {
            className: 'menu-item',
            text: '📂 新建子文件夹',
            events: {
              click: (e) => {
                e.stopPropagation();
                const name = prompt('输入子文件夹名称:');
                if (name && name.trim()) {
                  folder.children = folder.children || [];
                  folder.children.push({
                    id: Date.now().toString(),
                    name: name.trim(),
                    icon: '📁',
                    color: '#4f46e5',
                    conversations: [],
                    children: [],
                    createdAt: Date.now()
                  });
                  globalState.saveFolders();
                  this.renderFolders();
                }
                removeMenu();
              }
            }
          }),
          createElement('div', {
            className: 'menu-item danger',
            text: '🗑️ 删除',
            events: {
              click: (e) => {
                e.stopPropagation();
                if (confirm(`确定要删除文件夹 "${folder.name}" 吗？`)) {
                  this.deleteFolder(folder);
                }
                removeMenu();
              }
            }
          })
        ]
      });

      document.body.appendChild(menu);
      
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          removeMenu();
        }
      };
      const closeOnEsc = (e) => {
        if (e.key === 'Escape') {
          removeMenu();
        }
      };
      
      requestAnimationFrame(() => {
        document.addEventListener('mousedown', closeMenu, true);
        document.addEventListener('keydown', closeOnEsc, true);
      });
    }

    showConvContextMenu(event, conv, folder) {
      event.preventDefault();
      event.stopPropagation();
      document.querySelectorAll('.kimi-voyager-context-menu').forEach(m => m.remove());

      const removeMenu = () => {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu, true);
        document.removeEventListener('keydown', closeOnEsc, true);
      };

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
            text: '❌ 从文件夹移除',
            events: {
              click: async (e) => {
                e.stopPropagation();
                folder.conversations = folder.conversations.filter(c => c.id !== conv.id);
                try {
                  await globalState.saveFolders();
                  this.renderFolders();
                  showToast('已从文件夹移除', 'success');
                } catch (err) {
                  console.error('移除对话失败:', err);
                  showToast('移除失败，请重试', 'error');
                }
                removeMenu();
              }
            }
          }),
          createElement('div', {
            className: 'menu-item',
            text: '💬 打开对话',
            events: {
              click: (e) => {
                e.stopPropagation();
                window.location.href = `/chat/${conv.id}`;
                removeMenu();
              }
            }
          })
        ]
      });

      document.body.appendChild(menu);

      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          removeMenu();
        }
      };
      const closeOnEsc = (e) => {
        if (e.key === 'Escape') {
          removeMenu();
        }
      };

      requestAnimationFrame(() => {
        document.addEventListener('mousedown', closeMenu, true);
        document.addEventListener('keydown', closeOnEsc, true);
      });
    }

    async deleteFolder(folder) {
      const removeRecursively = (folders, id) => {
        const filtered = folders.filter(f => f.id !== id);
        filtered.forEach(f => {
          if (f.children) {
            f.children = removeRecursively(f.children, id);
          }
        });
        return filtered;
      };
      globalState.folders = removeRecursively(globalState.folders, folder.id);
      await globalState.saveFolders();
      this.renderFolders();
      showToast('文件夹已删除', 'success');
    }

    processPendingInterceptedData() {
      const pending = window.__kimiVoyagerInterceptedData;
      if (!pending || !pending.length) return;
      const newCount = pending.length - this.lastProcessedInterceptedIndex;
      if (newCount <= 0) return;
      console.log(`📡 Processing ${newCount} new intercepted data chunks (total: ${pending.length})`);
      for (let i = this.lastProcessedInterceptedIndex; i < pending.length; i++) {
        this.processInterceptedData(pending[i]);
      }
      this.lastProcessedInterceptedIndex = pending.length;
    }
    
    processInterceptedData(data) {
      if (!data || typeof data !== 'object') return;
      // 宽松解析：覆盖多种嵌套格式
      let convList = null;
      const possibleRoots = [
        data.conversations,
        data.chats,
        data.list,
        data.items,
        data.results,
        data.data,
        data.records,
        data.rows,
        data.history,
        data.chatList,
        data.conversationList,
        data.conversation_list,
        data.chat_list,
        Array.isArray(data) ? data : null
      ];
      for (const root of possibleRoots) {
        if (Array.isArray(root) && root.length > 0) {
          convList = root;
          break;
        }
      }
      // 如果根是对象且 data.data 也是对象，尝试 data.data.xxx
      if (!convList && data.data && typeof data.data === 'object') {
        const nestedRoots = [
          data.data.conversations,
          data.data.chats,
          data.data.list,
          data.data.items,
          data.data.results,
          data.data.records,
          data.data.rows,
          data.data.history,
          data.data.chatList,
          data.data.conversationList
        ];
        for (const root of nestedRoots) {
          if (Array.isArray(root) && root.length > 0) {
            convList = root;
            break;
          }
        }
      }
      if (!convList || !convList.length) return;
      
      const newConvs = [];
      convList.forEach(conv => {
        if (!conv || typeof conv !== 'object') return;
        const id = conv.id || conv.chatId || conv.conversationId || conv.conversation_id || conv.chat_id || conv.conv_id || conv.convId;
        const rawTitle = conv.title || conv.name || conv.subject || conv.topic || conv.summary || '';
        const title = typeof rawTitle === 'string' ? rawTitle.trim() : String(rawTitle).trim();
        if (!title) {
          // 跳过空 title
          return;
        }
        if (this.isValidConvId(id)) {
          newConvs.push({
            id,
            title,
            href: `/chat/${id}`,
            updatedAt: conv.updatedAt || conv.updated_at || conv.createTime || conv.created_at || conv.timestamp || conv.time || Date.now()
          });
        } else {
          // 跳过无效 ID
        }
      });
      
      if (newConvs.length > 0) {
        // 拦截器解析完成
        // 合并到 hiddenConversations
        newConvs.forEach(nc => {
          if (!this.hiddenConversations.find(c => c.id === nc.id)) {
            this.hiddenConversations.push(nc);
          }
        });
        this.hiddenConversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        this.historyLoaded = true;
        this.renderHiddenHistory();
        const countEl = this.container?.querySelector('.hidden-history-count');
        if (countEl) countEl.textContent = `(${this.hiddenConversations.length})`;
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
        // 如果未加载过，才执行加载
        if (!this.historyLoaded && this.hiddenConversations.length === 0) {
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

      // 尝试从页面数据获取所有历史对话
      const allConversations = await this.fetchAllConversations();
      
      // 显示所有对话，不再过滤侧边栏已显示的
      this.hiddenConversations = allConversations;
      if (allConversations.length > 0) {
        this.historyLoaded = true;
      }

      this.renderHiddenHistory();
    }

    async autoLoadHistory() {
      // 延迟等待页面稳定
      await new Promise(r => setTimeout(r, 2000));
      
      const content = this.container?.querySelector('.kimi-voyager-hidden-history-content');
      if (!content) return;
      
      // 避免重复加载（但允许在历史页面多次尝试）
      if (this.historyLoaded && this.hiddenConversations.length > 0 && !location.pathname.includes('/chat/history')) return;
      
      if (!this.historyLoaded || this.hiddenConversations.length === 0) {
        content.innerHTML = '<div class="hidden-history-loading">正在加载历史对话...</div>';
      }
      
      try {
        // 在历史页面尝试点击"查看全部"以触发更多数据加载
        if (location.pathname.includes('/chat/history')) {
          await this.triggerLoadMoreOnHistoryPage();
        }
        
        const allConversations = await this.fetchAllConversations();
        // autoLoadHistory 完成
        
        if (allConversations.length > 0) {
          // 合并而不是直接覆盖，保留已有的
          allConversations.forEach(ac => {
            if (!this.hiddenConversations.find(c => c.id === ac.id)) {
              this.hiddenConversations.push(ac);
            }
          });
          this.hiddenConversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          this.historyLoaded = true;
          this.renderHiddenHistory();
          const countEl = this.container.querySelector('.hidden-history-count');
          if (countEl) countEl.textContent = `(${this.hiddenConversations.length})`;
        } else if (this.hiddenConversations.length === 0) {
          content.innerHTML = '<div class="hidden-history-empty">暂无更多历史对话</div>';
        }
        
        // 在历史页面进行多次尝试
        this.autoLoadAttempts++;
        if (location.pathname.includes('/chat/history') && this.autoLoadAttempts < 5) {
          // 历史页面重试加载
          setTimeout(() => this.autoLoadHistory(), 3000);
        }
      } catch (e) {
        console.error('自动加载历史对话失败:', e);
        if (this.hiddenConversations.length === 0) {
          content.innerHTML = '<div class="hidden-history-error">加载失败，请稍后重试</div>';
        }
      }
    }

    // 尝试从历史页面点击"查看全部"等按钮触发更多数据加载
    async triggerLoadMoreOnHistoryPage() {
      if (!location.pathname.includes('/chat/history')) return false;
      const btnTexts = ['查看全部', '全部对话', '所有对话', '查看更多', 'load more', 'view all'];
      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], div'));
      for (const btn of buttons) {
        const text = (btn.textContent || btn.innerText || '').trim();
        if (btnTexts.some(t => text.toLowerCase().includes(t.toLowerCase()))) {
          // 点击加载更多按钮
          btn.click();
          await new Promise(r => setTimeout(r, 1500));
          return true;
        }
      }
      return false;
    }

    // 持续监听拦截数据的新数据
    startInterceptedDataPolling() {
      if (this.interceptedDataPollInterval) return;
      this.interceptedDataPollInterval = setInterval(() => {
        this.processPendingInterceptedData();
      }, 2000);
      // 拦截器轮询已启动
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

    isValidConvId(id) {
      if (!id || typeof id !== 'string') return false;
      // Kimi 对话 ID 有两种格式：
      // 1. 旧版：纯字母数字随机字符串，如 cuq3h25m2citjh45prb0（长度 20~22）
      // 2. 新版：UUID，如 19d93c55-c012-8dc5-8000-09b5cda1e7ae（长度 36）
      if (id.length < 10 || id.length > 40) return false;
      if (!/^[a-zA-Z0-9-]+$/.test(id)) return false;
      // 排除常见的非对话 ID
      const blacklist = ['history', 'settings', 'profile', 'account', 'login', 'logout', 'signup', 'admin', 'api', 'test', 'undefined', 'null'];
      const lowerId = id.toLowerCase();
      if (blacklist.some(b => lowerId.includes(b))) return false;
      return true;
    }

    async fetchHistoryFromPageHTML() {
      console.log('[fetchHistoryFromPageHTML] 方法入口');
      const conversations = [];
      const seenIds = new Set();
      const addConv = (id, title, href, updatedAt) => {
        if (!id || !this.isValidConvId(id) || seenIds.has(id) || !title) return false;
        seenIds.add(id);
        conversations.push({ id, title, href, updatedAt: updatedAt || Date.now() });
        return true;
      };

      const extractFromLinks = (links, sourceName) => {
        let found = 0;
        for (const link of links) {
          let id = link.getAttribute('data-conv-id') || '';
          let title = (link.getAttribute('data-conv-title') || '').trim();
          const href = link.getAttribute('href') || '';
          if (!id) {
            const idMatch = href.match(/\/chat\/([^/?#]+)/);
            if (idMatch) id = idMatch[1];
          }
          if (!title) {
            title = (link.textContent || '').trim().split('\n')[0] || '';
          }
          const excludeTexts = ['查看全部', '全部对话', '所有对话', '查看更多', 'view all', 'history'];
          if (!title || excludeTexts.some(t => title.toLowerCase().includes(t.toLowerCase()))) continue;
          if (addConv(id, title, href || `/chat/${id}`)) found++;
        }
        return found;
      };

      const parseHtmlConversations = (html, sourceName) => {
        if (!html) return;
        const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
        for (const scriptMatch of scriptMatches) {
          const scriptContent = scriptMatch[1];
          const statePatterns = [
            /window\.__INITIAL_STATE__\s*=\s*([\s\S]*?);?\s*(?=<\/script>|$)/i,
            /window\.__DATA__\s*=\s*([\s\S]*?);?\s*(?=<\/script>|$)/i,
            /window\.__APP__\s*=\s*([\s\S]*?);?\s*(?=<\/script>|$)/i,
            /window\._KIMI_DATA\s*=\s*([\s\S]*?);?\s*(?=<\/script>|$)/i,
            /window\.kimiData\s*=\s*([\s\S]*?);?\s*(?=<\/script>|$)/i
          ];
          for (const pattern of statePatterns) {
            const stateMatch = scriptContent.match(pattern);
            if (stateMatch) {
              try {
                const data = JSON.parse(stateMatch[1]);
                const allArrays = [
                  data.conversations, data.chats, data.chatList, data.conversationList,
                  data.history, data.list, data.items, data.results, data.records, data.rows,
                  data.data?.conversations, data.data?.chats, data.data?.chatList,
                  data.data?.conversationList, data.data?.history, data.data?.list,
                  data.data?.items, data.data?.results, data.data?.records,
                  Array.isArray(data) ? data : null
                ];
                for (const arr of allArrays) {
                  if (!Array.isArray(arr)) continue;
                  arr.forEach(conv => {
                    if (!conv || typeof conv !== 'object') return;
                    const id = conv.id || conv.chatId || conv.conversationId || conv.conversation_id || conv.chat_id || conv.conv_id || conv.convId;
                    const rawTitle = conv.title || conv.name || conv.subject || conv.topic || conv.summary || '';
                    const title = typeof rawTitle === 'string' ? rawTitle.trim() : String(rawTitle).trim();
                    if (title) addConv(id, title, `/chat/${id}`, conv.updatedAt || conv.updated_at || conv.createTime || conv.created_at || conv.timestamp || conv.time);
                  });
                }
              } catch (e) {}
            }
          }
        }
        if (typeof DOMParser !== 'undefined') {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const links = doc.querySelectorAll('a[href*="/chat/"]');
          extractFromLinks(links, sourceName);
        }
      };

      const hasConvData = (html) => html && (html.includes('data-conv-id') || html.includes('history-link') || /\/chat\/[a-zA-Z0-9-]{10,40}/.test(html));

      try {
        // 策略 A
        console.log('[fetchHistoryFromPageHTML] 策略A: 检查是否在历史页面');
        if (location.pathname.includes('/chat/history')) {
          console.log('[fetchHistoryFromPageHTML] 策略A: 在历史页面，读取当前 DOM');
          const currentHtml = document.documentElement.outerHTML;
          parseHtmlConversations(currentHtml, '当前页面DOM');
          console.log('[fetchHistoryFromPageHTML] 策略A: 完成，获取到', conversations.length, '条');
          return conversations;
        }
        console.log('[fetchHistoryFromPageHTML] 策略A: 不在历史页面，继续尝试其他策略');

        let html = '';

        // B3: 使用 access_token Bearer 调用 ListChats API
        console.log('[fetchHistoryFromPageHTML] 策略B3: access_token Bearer 调用 ListChats API');
        try {
          const possibleTokens = [];
          for (const store of [localStorage, sessionStorage]) {
            for (let i = 0; i < store.length; i++) {
              const key = store.key(i);
              const val = store.getItem(key);
              if (key && val && val.length >= 20 && val.length <= 2000) {
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes('access_token')) {
                  possibleTokens.push({ key, val });
                }
              }
            }
          }
          console.log('[fetchHistoryFromPageHTML] 策略B3: 扫描到', possibleTokens.length, '个可能的 token');

          const apiUrl = 'https://www.kimi.com/apiv2/kimi.chat.v1.ChatService/ListChats';
          for (const token of possibleTokens) {
            try {
              const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token.val}`
                },
                body: JSON.stringify({})
              });
              if (resp.ok) {
                const data = await resp.json();
                console.log(`[fetchHistoryFromPageHTML] 策略B3: Bearer API成功, key=${token.key}`);
                const possibleArrays = [
                  data.chats, data.conversations, data.chatList, data.conversationList,
                  data.history, data.list, data.items, data.results, data.records, data.rows,
                  Array.isArray(data) ? data : null
                ];
                for (const arr of possibleArrays) {
                  if (!Array.isArray(arr)) continue;
                  for (const conv of arr) {
                    if (!conv || typeof conv !== 'object') continue;
                    const id = conv.id || conv.chatId || conv.conversationId || conv.conversation_id || conv.chat_id || conv.conv_id || conv.convId;
                    const rawTitle = conv.title || conv.name || conv.subject || conv.topic || conv.summary || '';
                    const title = typeof rawTitle === 'string' ? rawTitle.trim() : String(rawTitle).trim();
                    if (title && this.isValidConvId(id) && !seenIds.has(id)) {
                      seenIds.add(id);
                      conversations.push({
                        id,
                        title,
                        href: `/chat/${id}`,
                        updatedAt: conv.updatedAt || conv.updateTime || conv.updated_at || conv.createTime || conv.created_at || conv.timestamp || conv.time || Date.now()
                      });
                    }
                  }
                }
                if (conversations.length > 0) {
                  console.log('[fetchHistoryFromPageHTML] 策略B3: 成功，获取到', conversations.length, '条');
                  return conversations;
                }
              }
            } catch (e) {}
          }
          console.log('[fetchHistoryFromPageHTML] 策略B3: 所有 Bearer token 尝试都失败');
        } catch (e) {
          console.log('[fetchHistoryFromPageHTML] 策略B3: 异常', e.message);
        }

      } catch (error) {
        console.log('[fetchHistoryFromPageHTML] 外层异常', error.message);
      }
      console.log('[fetchHistoryFromPageHTML] 所有策略都失败，最终返回', conversations.length, '条');
      return conversations;
    }

    async fetchAllConversations() {
      const conversations = [];
      // 开始获取对话
      
      // 辅助函数：从任意对象中提取对话列表（宽松解析）
      const extractConversations = (source, sourceName) => {
        let found = 0;
        if (!source || typeof source !== 'object') return 0;
        
        // 尝试多种可能的数组字段
        const possibleArrays = [
          source.conversations,
          source.chats,
          source.chatList,
          source.conversationList,
          source.history,
          source.list,
          source.items,
          source.results,
          source.records,
          source.rows,
          Array.isArray(source) ? source : null
        ];
        
        for (const arr of possibleArrays) {
          if (!Array.isArray(arr)) continue;
          arr.forEach(conv => {
            if (!conv || typeof conv !== 'object') return;
            const id = conv.id || conv.chatId || conv.conversationId || conv.conversation_id || conv.chat_id || conv.conv_id || conv.convId;
            const rawTitle = conv.title || conv.name || conv.subject || conv.topic || conv.summary || '';
            const title = typeof rawTitle === 'string' ? rawTitle.trim() : String(rawTitle).trim();
            if (!title) {
              // 跳过空 title
              return;
            }
            if (!this.isValidConvId(id)) {
              // 跳过无效 ID
              return;
            }
            if (!conversations.find(c => c.id === id)) {
              conversations.push({
                id,
                title,
                href: `/chat/${id}`,
                updatedAt: conv.updatedAt || conv.updated_at || conv.createTime || conv.created_at || conv.timestamp || conv.time || Date.now()
              });
              found++;
            }
          });
        }
        
        // 如果直接字段没找到，尝试嵌套的 data 字段
        if (found === 0 && source.data && typeof source.data === 'object') {
          const nestedArrays = [
            source.data.conversations,
            source.data.chats,
            source.data.chatList,
            source.data.conversationList,
            source.data.history,
            source.data.list,
            source.data.items,
            source.data.results,
            source.data.records
          ];
          for (const arr of nestedArrays) {
            if (!Array.isArray(arr)) continue;
            arr.forEach(conv => {
              if (!conv || typeof conv !== 'object') return;
              const id = conv.id || conv.chatId || conv.conversationId || conv.conversation_id || conv.chat_id || conv.conv_id || conv.convId;
              const rawTitle = conv.title || conv.name || conv.subject || conv.topic || conv.summary || '';
              const title = typeof rawTitle === 'string' ? rawTitle.trim() : String(rawTitle).trim();
              if (!title) {
                // 跳过空 title
                return;
              }
              if (!this.isValidConvId(id)) {
                // 跳过无效 ID
                return;
              }
              if (!conversations.find(c => c.id === id)) {
                conversations.push({
                  id,
                  title,
                  href: `/chat/${id}`,
                  updatedAt: conv.updatedAt || conv.updated_at || conv.createTime || conv.created_at || conv.timestamp || conv.time || Date.now()
                });
                found++;
              }
            });
          }
        }
        
        if (found > 0) {
          // 从来源获取完成
        }
        return found;
      };
      
      // 方法1: 主动抓取 /chat/history 页面 HTML（最可靠，能拿到全部）
      try {
        const htmlConvs = await this.fetchHistoryFromPageHTML();
        if (htmlConvs && htmlConvs.length > 0) {
          htmlConvs.forEach(conv => {
            if (!conversations.find(c => c.id === conv.id)) {
              conversations.push(conv);
            }
          });
          // 从 HTML 获取完成
        }
      } catch (e) {
        // HTML 抓取失败
      }

      // 方法2: 从全局拦截器获取（Kimi 页面自己请求的 API 数据）
      try {
        const pending = window.__kimiVoyagerInterceptedData;
        if (pending && pending.length > 0) {
          let foundFromIntercept = 0;
          for (let i = 0; i < pending.length; i++) {
            foundFromIntercept += extractConversations(pending[i], `拦截器[${i}]`);
          }
          if (foundFromIntercept > 0) {
            // 从拦截器获取完成
          }
        }
      } catch (e) {
        // 拦截器获取失败
      }

      // 方法3: 从页面全局变量获取（Kimi 可能把数据挂在 window 上）
      try {
        const globalKeys = ['__INITIAL_STATE__', '__DATA__', '__APP__', '__config', '_KIMI_DATA', 'kimiData', '__SERVER_DATA__', '__INITIAL_PROPS__'];
        for (const gk of globalKeys) {
          const globalData = window[gk];
          if (globalData) {
            const found = extractConversations(globalData, `window.${gk}`);
            if (found > 0) {
              // 从全局变量获取完成
            }
          }
        }
      } catch (e) {
        // 全局变量获取失败
      }

      // 方法4: 尝试从 localStorage 获取（限制扫描数量和大小）
      try {
        const keys = Object.keys(localStorage);
        let scanned = 0;
        for (const key of keys) {
          if (key.includes('chat') || key.includes('conversation') || key.includes('history') || key.includes('kimi')) {
            try {
              const raw = localStorage.getItem(key);
              if (!raw || raw.length > 500000) continue;
              const data = JSON.parse(raw);
              extractConversations(data, `localStorage.${key}`);
            } catch (e) {}
          }
          scanned++;
          if (scanned > 50) break;
        }
      } catch (e) {}

      // 方法5: 从当前页面链接获取（限制数量，过滤非对话项）
      try {
        const links = document.querySelectorAll('a[href*="/chat/"]');
        let count = 0;
        let foundFromLinks = 0;
        for (const link of links) {
          // 优先使用 data-conv-id / data-conv-title
          let id = link.getAttribute('data-conv-id') || '';
          let title = (link.getAttribute('data-conv-title') || '').trim();
          let href = link.getAttribute('href') || '';
          
          if (!id) {
            const match = href.match(/\/chat\/([^/?#]+)/);
            if (match) id = match[1];
          }
          if (!title) {
            title = (link.textContent || '').trim().split('\n')[0] || '';
          }
          
          if (!id || !this.isValidConvId(id)) {
            // 链接 ID 无效
            continue;
          }
          if (!title) {
            // 链接 title 为空
            continue;
          }
          const excludeTexts = ['查看全部', '全部对话', '所有对话', '查看更多', 'view all'];
          if (excludeTexts.some(t => title.toLowerCase().includes(t.toLowerCase()))) continue;

          if (!conversations.find(c => c.id === id)) {
            conversations.push({ id, title, href });
            foundFromLinks++;
          }
          count++;
          if (count > 200) break;
        }
        if (foundFromLinks > 0) {
          // 从页面链接获取完成
        }
      } catch (e) {}

      // fetchAllConversations 完成
      return conversations;
    }

    renderHiddenHistory() {
      const content = this.container.querySelector('.kimi-voyager-hidden-history-content');
      content.innerHTML = '';

      if (this.hiddenConversations.length === 0) {
        content.innerHTML = '<div class="hidden-history-empty">暂无更多历史对话</div>';
        const countEl = this.container.querySelector('.hidden-history-count');
        if (countEl) countEl.textContent = '(0)';
        return;
      }

      const list = createElement('div', { className: 'hidden-history-list' });
      const MAX_BATCH = 100;
      const total = this.hiddenConversations.length;

      const renderBatch = (start, count) => {
        const end = Math.min(start + count, total);
        const fragment = document.createDocumentFragment();
        
        const currentConvId = location.pathname.match(/\/chat\/([^/?#]+)/)?.[1] || '';
        
        for (let i = start; i < end; i++) {
          const conv = this.hiddenConversations[i];
          const isActive = currentConvId && conv.id === currentConvId;
          const item = createElement('div', {
            className: `hidden-history-item ${isActive ? 'active' : ''}`,
            attributes: { 'data-conv-id': conv.id },
            events: {
              click: () => { window.location.href = conv.href; },
              contextmenu: (e) => this.showHiddenConvContextMenu(e, conv),
              mousedown: (e) => {
                // 长按触发拖拽
                if (e.button !== 0) return;
                let timer = setTimeout(() => {
                  item.draggable = true;
                }, 400);
                const clearTimer = () => {
                  clearTimeout(timer);
                  window.removeEventListener('mouseup', clearTimer);
                };
                window.addEventListener('mouseup', clearTimer, { once: true });
              },
              dragstart: (e) => {
                if (!item.draggable) {
                  e.preventDefault();
                  return;
                }
                this._dragState = {
                  type: 'conversation',
                  id: conv.id,
                  title: conv.title,
                  sourceEl: item
                };
                e.dataTransfer.setData('application/json', JSON.stringify({
                  type: 'conversation', id: conv.id, title: conv.title
                }));
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('dragging');
                item.style.opacity = '0.4';
                item.style.transition = 'opacity 0.15s';
              },
              dragend: () => {
                item.draggable = false;
                this._cleanupDrag();
              }
            },
            children: [
              createElement('span', { className: 'hidden-history-drag-handle', text: '⋮⋮' }),
              createElement('span', { className: 'hidden-history-item-icon', text: '💬' }),
              createElement('span', {
                className: 'hidden-history-item-title',
                text: conv.title
              })
            ]
          });
          fragment.appendChild(item);
        }
        
        list.appendChild(fragment);
        
        // 如果还有更多，显示加载更多按钮
        if (end < total) {
          const existingLoadMore = content.querySelector('.hidden-history-load-more');
          if (existingLoadMore) existingLoadMore.remove();
          
          const loadMore = createElement('div', {
            className: 'hidden-history-load-more',
            text: `加载更多 (${total - end})`,
            events: {
              click: () => {
                loadMore.textContent = '加载中...';
                requestAnimationFrame(() => {
                  renderBatch(end, MAX_BATCH);
                  loadMore.remove();
                });
              }
            }
          });
          content.appendChild(loadMore);
        }
      };

      content.appendChild(list);
      renderBatch(0, MAX_BATCH);
      
      const countEl = this.container.querySelector('.hidden-history-count');
      if (countEl) countEl.textContent = `(${total})`;
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
                if (globalState.moveConversationToFolder(conv.id, conv.title, folder.id)) {
                  showToast(`已移动到 "${folder.name}"`, 'success');
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

      // 使用 mousedown + capture 确保点击外部一定能关闭
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('mousedown', closeMenu, true);
          document.removeEventListener('keydown', closeOnEsc, true);
        }
      };
      const closeOnEsc = (e) => {
        if (e.key === 'Escape') {
          menu.remove();
          document.removeEventListener('mousedown', closeMenu, true);
          document.removeEventListener('keydown', closeOnEsc, true);
        }
      };
      requestAnimationFrame(() => {
        document.addEventListener('mousedown', closeMenu, true);
        document.addEventListener('keydown', closeOnEsc, true);
      });
    }

    // ========== Drop Indicator Helpers ==========
    _setDropIndicator(el, position) {
      if (this._currentDropTarget === el && this._dropPosition === position) return;
      this._clearDropIndicator();
      this._currentDropTarget = el;
      this._dropPosition = position;
      if (position === 'inside') {
        el.classList.add('drag-over');
      } else if (position === 'before') {
        el.classList.add('drop-before');
      } else if (position === 'after') {
        el.classList.add('drop-after');
      }
    }

    _clearDropIndicator() {
      if (this._currentDropTarget) {
        this._currentDropTarget.classList.remove('drag-over', 'drop-before', 'drop-after');
        this._currentDropTarget = null;
        this._dropPosition = null;
      }
    }

    _cleanupDrag() {
      if (this._dragState?.sourceEl) {
        this._dragState.sourceEl.classList.remove('dragging');
        this._dragState.sourceEl.style.opacity = '';
        this._dragState.sourceEl.style.transition = '';
      }
      this._dragState = null;
      this._clearDropIndicator();
      document.querySelectorAll('.kimi-voyager-folder-item.drag-over, .kimi-voyager-folder-item.drop-before, .kimi-voyager-folder-item.drop-after').forEach(el => {
        el.classList.remove('drag-over', 'drop-before', 'drop-after');
      });
    }

    // ========== Drag & Drop ==========
    setupDragAndDrop() {
      let lastChatCount = 0;
      
      const makeItemsDraggable = () => {
        // 在历史对话页不注入收藏按钮，避免干扰编辑标题
        const isHistoryPage = location.pathname.includes('/chat/history');
        
        // 查找所有可能包含对话的容器
        const containers = document.querySelectorAll('.sidebar, [class*="sidebar"], aside, nav, [class*="history"], [class*="chat-list"]');
        
        containers.forEach(container => {
          // 跳过 Voyager 自己的容器
          if (container.closest('.kimi-voyager-folders')) return;
          
          // 查找对话项
          const chatItems = container.querySelectorAll('a[href*="/chat/"], [class*="chat-item"], [class*="conversation-item"], [class*="chat-info"], [data-conv-id], [data-chat-id]');
          
          chatItems.forEach(item => {
            if (item.dataset.voyagerDraggable === 'true') return;
            if (item.closest('.kimi-voyager-folders, .kimi-voyager-folder-selector, .kimi-voyager-context-menu')) return;
            
            const href = item.getAttribute('href') || '';
            const convId = item.dataset.convId || item.dataset.chatId || (href.match(/\/chat\/([^/?#]+)/) ? href.match(/\/chat\/([^/?#]+)/)[1] : '');
            if (!convId) return;
            
            const text = item.textContent.trim();
            const excludeTexts = ['查看全部', '全部对话', '所有对话', '查看更多', 'view all', 'load more'];
            if (excludeTexts.some(t => text.toLowerCase().includes(t.toLowerCase()))) return;
            if (href === '/chat' || href === '/chat/' || href.endsWith('/chat/')) return;
            
            item.dataset.voyagerDraggable = 'true';
            item.dataset.convId = convId;
            item.draggable = false; // Disable native drag; rely on long-press custom drag
            item.style.cursor = 'grab';
            
            let title = '';
            const titleSelectors = ['.chat-name', '[class*="chat-name"]', '.title', '[class*="title"]', '.name', '[class*="name"]'];
            for (const sel of titleSelectors) {
              const titleEl = item.querySelector(sel);
              if (titleEl) { title = titleEl.textContent.trim(); break; }
            }
            if (!title) title = item.textContent.trim().split('\n')[0] || convId;
            item.dataset.convTitle = title;
            
            // 添加收藏按钮（排除历史对话页和文件夹内部）
            if (!isHistoryPage && !item.closest('.kimi-voyager-folders')) {
              this.addFavoriteButton(item, convId, title);
            }
          });
          
          lastChatCount += chatItems.length;
        });
      };
      
      makeItemsDraggable();
      this.dragDropInterval = setInterval(makeItemsDraggable, 3000);
    }

    // ========== Global Long-Press Drag (works on any chat item) ==========
    setupGlobalLongPressDrag() {
      if (this._globalDragBound) return;
      this._globalDragBound = true;
      
      let lpTimer = null;
      let lpStartX = 0;
      let lpStartY = 0;
      let lpConvId = null;
      let lpTitle = null;
      
      const clearLp = () => {
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      };
      
      const getConvInfo = (target) => {
        const item = target.closest('a[href*="/chat/"], [class*="chat-item"], [class*="conversation-item"], [class*="chat-info"], [data-conv-id], [data-chat-id]');
        if (!item || item.closest('.kimi-voyager-folders, .kimi-voyager-folder-selector, .kimi-voyager-context-menu')) return null;
        
        const href = item.getAttribute('href') || '';
        const convId = item.dataset.convId || item.dataset.chatId || (href.match(/\/chat\/([^/?#]+)/)?.[1]);
        if (!convId || !this.isValidConvId(convId)) return null;
        
        const text = item.textContent.trim();
        const excludeTexts = ['查看全部', '全部对话', '所有对话', '查看更多', 'view all', 'load more'];
        if (excludeTexts.some(t => text.toLowerCase().includes(t.toLowerCase()))) return null;
        if (href === '/chat' || href === '/chat/' || href.endsWith('/chat/')) return null;
        
        let title = '';
        const titleSelectors = ['.chat-name', '[class*="chat-name"]', '.title', '[class*="title"]', '.name', '[class*="name"]'];
        for (const sel of titleSelectors) {
          const titleEl = item.querySelector(sel);
          if (titleEl) { title = titleEl.textContent.trim(); break; }
        }
        if (!title) title = item.textContent.trim().split('\n')[0] || convId;
        
        return { item, convId, title };
      };
      
      // capture 阶段监听，绕过 React 事件拦截
      document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const info = getConvInfo(e.target);
        if (!info) return;
        
        lpStartX = e.clientX;
        lpStartY = e.clientY;
        lpConvId = info.convId;
        lpTitle = info.title;
        
        lpTimer = setTimeout(() => {
          lpTimer = null;
          document.body.style.userSelect = 'none';
          this.startMouseDrag(lpStartX, lpStartY, lpConvId, lpTitle);
        }, 500);
      }, true);
      
      document.addEventListener('mousemove', (e) => {
        if (!lpTimer) return;
        const dx = e.clientX - lpStartX;
        const dy = e.clientY - lpStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) clearLp();
      }, true);
      
      document.addEventListener('mouseup', () => {
        clearLp();
        if (document.body.style.userSelect === 'none') document.body.style.userSelect = '';
      }, true);
      
      // 触摸设备
      document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const info = getConvInfo(touch.target);
        if (!info) return;
        
        lpStartX = touch.clientX;
        lpStartY = touch.clientY;
        lpConvId = info.convId;
        lpTitle = info.title;
        
        lpTimer = setTimeout(() => {
          lpTimer = null;
          document.body.style.userSelect = 'none';
          this.startMouseDrag(lpStartX, lpStartY, lpConvId, lpTitle);
        }, 500);
      }, { passive: true, capture: true });
      
      document.addEventListener('touchmove', (e) => {
        if (!lpTimer || e.touches.length !== 1) return;
        const touch = e.touches[0];
        const dx = touch.clientX - lpStartX;
        const dy = touch.clientY - lpStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) clearLp();
      }, { passive: true, capture: true });
      
      document.addEventListener('touchend', () => {
        clearLp();
        if (document.body.style.userSelect === 'none') document.body.style.userSelect = '';
      }, { capture: true });
    }

    addFavoriteButton(item, convId, title) {
      // 在历史对话页不添加收藏按钮，避免干扰编辑标题
      if (location.pathname.includes('/chat/history')) return;
      
      // 避免重复添加
      if (item.querySelector('.voyager-fav-btn')) return;
      
      // 不给自己文件夹内的对话添加
      if (item.closest('.kimi-voyager-folders')) return;
      
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

    // ========== Custom Mouse Drag (bypass HTML5 DnD blocking) ==========
    startMouseDrag(startX, startY, convId, title) {
      if (this.mouseDrag) return;
      
      // Create ghost element
      const ghost = createElement('div', {
        className: 'voyager-drag-ghost',
        styles: {
          position: 'fixed',
          left: `${startX}px`,
          top: `${startY}px`,
          zIndex: '99999',
          pointerEvents: 'none',
          opacity: '0.9',
          transform: 'translate(-50%, -50%) scale(1.05)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        },
        children: [
          createElement('div', {
            className: 'voyager-drag-ghost-inner',
            styles: {
              background: 'rgba(31, 41, 55, 0.95)',
              border: '1px solid rgba(79, 70, 229, 0.5)',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              color: '#e5e7eb',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            },
            children: [
              createElement('span', { text: '💬' }),
              createElement('span', { text: title.length > 20 ? title.slice(0, 20) + '...' : title })
            ]
          })
        ]
      });
      
      document.body.appendChild(ghost);
      
      this.mouseDrag = {
        convId,
        title,
        ghost,
        hasMoved: false
      };
      
      const onMove = (ev) => this.handleMouseDragMove(ev);
      const onUp = (ev) => this.handleMouseDragEnd(ev);
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp, { once: true });
    }
    
    handleMouseDragMove(e) {
      if (!this.mouseDrag) return;
      const { ghost } = this.mouseDrag;
      
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      this.mouseDrag.hasMoved = true;
      
      this._clearDropIndicator();
      
      // Hide ghost momentarily to get element below
      ghost.style.display = 'none';
      const elBelow = document.elementFromPoint(e.clientX, e.clientY);
      ghost.style.display = '';
      
      if (elBelow) {
        const folderItem = elBelow.closest('.kimi-voyager-folder-item');
        if (folderItem) {
          this._setDropIndicator(folderItem, 'inside');
        }
      }
    }
    
    async handleMouseDragEnd(e) {
      if (!this.mouseDrag) return;
      const { convId, title, ghost, hasMoved } = this.mouseDrag;
      this.mouseDrag = null;
      
      ghost.remove();
      this._clearDropIndicator();
      
      if (!hasMoved) return; // Just a click, not a drag
      
      // Find folder under cursor
      const elBelow = document.elementFromPoint(e.clientX, e.clientY);
      if (!elBelow) return;
      
      const folderItem = elBelow.closest('.kimi-voyager-folder-item');
      if (!folderItem) return;
      
      const folderId = folderItem.dataset.folderId;
      if (!folderId) return;
      
      // 递归查找目标文件夹
      const findFolderById = (folders, id) => {
        for (const f of folders) {
          if (f.id === id) return f;
          if (f.children) {
            const found = findFolderById(f.children, id);
            if (found) return found;
          }
        }
        return null;
      };
      
      const targetFolder = findFolderById(globalState.folders, folderId);
      if (!targetFolder) return;
      
      if (globalState.moveConversationToFolder(convId, title, folderId)) {
        this.renderFolders();
        showToast(`已移动 "${title}" 到 "${targetFolder.name}"`, 'success');
      } else {
        showToast('该对话已在文件夹中', 'info');
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
      
      // 递归渲染文件夹列表
      const renderSelectorFolder = (folder, depth = 0) => {
        const item = createElement('div', {
          className: 'selector-folder-item',
          styles: { paddingLeft: `${12 + depth * 16}px` },
          events: {
            click: () => {
              if (globalState.moveConversationToFolder(convId, title, folder.id)) {
                showToast(`已移动到 "${folder.name}"`, 'success');
                this.renderFolders();
              } else {
                showToast('该对话已在文件夹中', 'info');
              }
              selector.remove();
            }
          }
        });
        item.appendChild(createElement('span', { text: `📁 ${folder.name}` }));
        selector.appendChild(item);
        
        if (folder.children?.length > 0) {
          folder.children.forEach(child => renderSelectorFolder(child, depth + 1));
        }
      };
      
      if (globalState.folders.length === 0) {
        selector.appendChild(createElement('div', {
          className: 'selector-empty',
          text: '暂无文件夹，请先创建'
        }));
      } else {
        globalState.folders.forEach(folder => renderSelectorFolder(folder));
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
      
      // 使用 mousedown + capture 确保点击外部一定能关闭
      const closeSelector = (e) => {
        if (!selector.contains(e.target)) {
          selector.remove();
          document.removeEventListener('mousedown', closeSelector, true);
          document.removeEventListener('keydown', closeOnEsc, true);
        }
      };
      const closeOnEsc = (e) => {
        if (e.key === 'Escape') {
          selector.remove();
          document.removeEventListener('mousedown', closeSelector, true);
          document.removeEventListener('keydown', closeOnEsc, true);
        }
      };
      requestAnimationFrame(() => {
        document.addEventListener('mousedown', closeSelector, true);
        document.addEventListener('keydown', closeOnEsc, true);
      });
    }

    observeNativeMenus() {
      // 记录最后交互的对话（右键或左键点击对话项时）
      const storeConv = (e) => {
        const chatLink = e.target.closest('a[href*="/chat/"], [class*="chat-item"], [class*="conversation-item"]');
        if (chatLink) {
          const href = chatLink.getAttribute('href') || '';
          const convId = chatLink.dataset.convId || (href.match(/\/chat\/([^/?#]+)/) ? href.match(/\/chat\/([^/?#]+)/)[1] : '');
          if (convId && this.isValidConvId(convId)) {
            let title = '';
            const titleSelectors = ['.chat-name', '[class*="chat-name"]', '.title', '[class*="title"]', '.name', '[class*="name"]'];
            for (const sel of titleSelectors) {
              const titleEl = chatLink.querySelector(sel);
              if (titleEl) { title = titleEl.textContent.trim(); break; }
            }
            if (!title) title = chatLink.textContent.trim().split('\n')[0] || convId;
            this.lastRightClickedConv = { id: convId, title, element: chatLink };
          }
        }
      };
      document.addEventListener('contextmenu', storeConv);
      document.addEventListener('click', storeConv, true);

      // 只在 body 新增直接子节点时注入菜单选项（弹出菜单通常是 body 的直接子节点）
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            
            // 跳过 Voyager 自己的元素
            if (node.closest?.('.kimi-voyager-folders, .kimi-voyager-folder-selector, .kimi-voyager-context-menu')) continue;
            
            // 检查新增节点本身是否是菜单容器
            const role = node.getAttribute('role');
            const isMenuContainer = role === 'menu' || role === 'listbox' || /dropdown|popover|menu|portal|overlay/i.test(node.className || '');
            
            if (isMenuContainer) {
              this.injectMenuOption(node);
              continue;
            }
            
            // 检查新增节点内部是否有菜单（通常弹出菜单就是新增节点本身，这里是兜底）
            node.querySelectorAll?.('[role="menu"], [role="listbox"]').forEach(menu => {
              if (!menu.closest('.kimi-voyager-folders, .kimi-voyager-folder-selector, .kimi-voyager-context-menu')) {
                this.injectMenuOption(menu);
              }
            });
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: false });
    }

    injectMenuOption(menuEl) {
      if (!this.lastRightClickedConv) return;
      if (menuEl.querySelector('.voyager-menu-add-to-folder')) return;

      const menuList = menuEl.querySelector('ul, ol, [class*="list"], [role="menu"]') || menuEl;
      if (!menuList) return;

      const { id: convId, title } = this.lastRightClickedConv;

      const option = createElement('div', {
        className: 'voyager-menu-add-to-folder',
        text: '⭐ 添加到文件夹',
        styles: {
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: '14px',
          color: '#e5e7eb',
          transition: 'background 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderTop: menuList.children.length > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none'
        },
        events: {
          click: (e) => {
            e.stopPropagation();
            this.showFolderSelector(e, convId, title);
            menuEl.remove();
            const overlay = document.querySelector('[class*="overlay"], [class*="backdrop"]');
            if (overlay) overlay.remove();
          },
          mouseenter: (e) => { e.target.style.background = 'rgba(255,255,255,0.1)'; },
          mouseleave: (e) => { e.target.style.background = 'transparent'; }
        }
      });

      menuList.appendChild(option);
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
      this._clearDropIndicator();
      
      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
      } catch (err) { return; }
      
      const convId = data.id || data.convId;
      if ((data.type === 'conversation' || data.type === 'folder-conversation') && convId) {
        // 递归查找源文件夹（用于显示移动提示）
        const findSourceFolder = (folders) => {
          for (const f of folders) {
            if (f.conversations?.some(c => c.id === convId)) return f;
            if (f.children) {
              const found = findSourceFolder(f.children);
              if (found) return found;
            }
          }
          return null;
        };
        const sourceFolder = findSourceFolder(globalState.folders);
        const convTitle = data.title || '未命名对话';
        if (globalState.moveConversationToFolder(convId, convTitle, folder.id)) {
          this.renderFolders();
          if (sourceFolder && sourceFolder.id !== folder.id) {
            showToast(`已移动 "${convTitle}" 到 "${folder.name}"`, 'success');
          } else {
            showToast(`已添加 "${convTitle}" 到 "${folder.name}"`, 'success');
          }
        } else {
          showToast('该对话已在文件夹中', 'info');
        }
      }
    }

    handleFolderConvDragStart(e, folder, conv, index) {
      this.currentDrag = { type: 'folder-conversation', folderId: folder.id, convId: conv.id, fromIndex: index, title: conv.title };
      this._dragState = { type: 'folder-conversation', id: conv.id, title: conv.title, sourceEl: e.target };
      e.stopPropagation();
      e.dataTransfer.setData('application/json', JSON.stringify(this.currentDrag));
      e.dataTransfer.effectAllowed = 'move';
      e.target.classList.add('dragging');
    }

    handleFolderConvDragEnd() {
      this.currentDrag = null;
      document.querySelectorAll('.folder-drop-indicator').forEach(el => {
        el.style.display = 'none';
      });
      this._cleanupDrag();
    }

    handleFolderContentDragOver(e, folder, contentArea) {
      e.preventDefault();
      e.stopPropagation();

      if (!this.currentDrag || this.currentDrag.type !== 'folder-conversation') return;
      if (this.currentDrag.folderId !== folder.id) return;

      const indicator = contentArea.querySelector('.folder-drop-indicator');
      if (!indicator) return;

      const convItems = [...contentArea.querySelectorAll('.folder-conv-item')];
      if (convItems.length === 0) {
        indicator.style.display = 'block';
        indicator.style.top = '0px';
        return;
      }

      const rect = contentArea.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;

      let insertIndex = 0;
      for (let i = 0; i < convItems.length; i++) {
        const itemRect = convItems[i].getBoundingClientRect();
        const itemCenter = itemRect.top + itemRect.height / 2 - rect.top;
        if (relativeY > itemCenter) {
          insertIndex = i + 1;
        }
      }

      this.folderDropTargetIndex = insertIndex;

      let targetTop = 0;
      if (insertIndex >= convItems.length) {
        const lastItem = convItems[convItems.length - 1];
        const lastRect = lastItem.getBoundingClientRect();
        targetTop = lastRect.bottom - rect.top;
      } else {
        const targetItem = convItems[insertIndex];
        const targetRect = targetItem.getBoundingClientRect();
        targetTop = targetRect.top - rect.top;
      }

      indicator.style.display = 'block';
      indicator.style.top = `${targetTop}px`;
    }

    handleFolderContentDragLeave(e, contentArea) {
      if (!contentArea.contains(e.relatedTarget)) {
        const indicator = contentArea.querySelector('.folder-drop-indicator');
        if (indicator) indicator.style.display = 'none';
      }
    }

    handleFolderContentDrop(e, folder, contentArea) {
      const indicator = contentArea.querySelector('.folder-drop-indicator');
      if (indicator) indicator.style.display = 'none';

      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
      } catch (err) { data = {}; }

      if (data.type === 'folder-conversation' && data.folderId === folder.id) {
        e.preventDefault();
        e.stopPropagation();

        const fromIndex = data.fromIndex;
        let toIndex = this.folderDropTargetIndex !== undefined ? this.folderDropTargetIndex : folder.conversations.length;

        if (fromIndex < toIndex) toIndex--;

        if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= folder.conversations.length) return;

        const [moved] = folder.conversations.splice(fromIndex, 1);
        folder.conversations.splice(toIndex, 0, moved);

        globalState.saveFolders();
        this.renderFolders();
        showToast('已重新排序', 'success');
      }
    }

    injectStyles() {
      const style = createElement('style', {
        attributes: { 'data-kv-folder-styles': '1' },
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
            flex-direction: column;
            align-items: stretch;
            gap: 0;
            padding: 0;
            border-radius: 8px;
            cursor: default;
            transition: all 0.2s;
            border: 2px dashed transparent;
            margin-bottom: 4px;
            overflow: hidden;
          }
          .kimi-voyager-folder-item .folder-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            cursor: pointer;
            transition: background 0.2s;
            width: 100%;
            box-sizing: border-box;
          }
          .kimi-voyager-folder-item .folder-header:hover {
            background: rgba(255, 255, 255, 0.08);
          }
          .kimi-voyager-folder-item.expanded {
            background: rgba(255, 255, 255, 0.03);
          }
          .kimi-voyager-folder-item.expanded .folder-header {
            background: rgba(255, 255, 255, 0.05);
          }
          .kimi-voyager-folder-item.drag-over {
            background: rgba(79, 70, 229, 0.2);
            border-color: #4f46e5;
            transform: scale(1.02);
          }
          .kimi-voyager-folder-item.drop-before {
            position: relative;
          }
          .kimi-voyager-folder-item.drop-before::before {
            content: '';
            position: absolute;
            top: -2px;
            left: 8px;
            right: 8px;
            height: 2px;
            background: #4f46e5;
            border-radius: 1px;
            z-index: 10;
            pointer-events: none;
            box-shadow: 0 0 6px rgba(79, 70, 229, 0.6);
          }
          .kimi-voyager-folder-item.drop-after {
            position: relative;
          }
          .kimi-voyager-folder-item.drop-after::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 8px;
            right: 8px;
            height: 2px;
            background: #4f46e5;
            border-radius: 1px;
            z-index: 10;
            pointer-events: none;
            box-shadow: 0 0 6px rgba(79, 70, 229, 0.6);
          }
          .hidden-history-item.dragging {
            opacity: 0.4 !important;
            background: rgba(79, 70, 229, 0.1);
            border: 1px dashed rgba(79, 70, 229, 0.3);
          }
          .folder-conv-item.dragging {
            opacity: 0.4;
            background: rgba(79, 70, 229, 0.1);
          }
          .folder-arrow {
            font-size: 10px;
            color: #6b7280;
            transition: transform 0.2s;
            width: 12px;
            text-align: center;
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
          .folder-content {
            display: none;
            padding: 4px 4px 4px 32px;
          }
          .kimi-voyager-folder-item.expanded .folder-content {
            display: block;
          }
          .folder-conv-list {
            display: flex;
            flex-direction: column;
            position: relative;
          }
          .folder-conv-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 12px;
            color: #9ca3af;
            position: relative;
          }
          .folder-conv-item:hover {
            background: rgba(255, 255, 255, 0.05);
            color: #e5e7eb;
          }
          .folder-conv-item.active {
            background: rgba(79, 70, 229, 0.15);
            color: #e5e7eb;
            border-left: 3px solid #4f46e5;
          }
          .folder-conv-item.dragging {
            opacity: 0.5;
          }
          .folder-conv-drag-handle {
            font-size: 10px;
            color: #4b5563;
            cursor: grab;
            user-select: none;
            opacity: 0;
            transition: opacity 0.2s;
            letter-spacing: -2px;
            width: 14px;
          }
          .folder-conv-item:hover .folder-conv-drag-handle {
            opacity: 1;
          }
          .folder-conv-icon { font-size: 12px; }
          .folder-conv-title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
          }
          .folder-drop-indicator {
            display: none;
            position: absolute;
            left: 0;
            right: 0;
            height: 2px;
            background: #4f46e5;
            border-radius: 1px;
            pointer-events: none;
            z-index: 5;
          }

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
          }
          .hidden-history-item:hover {
            background: rgba(255, 255, 255, 0.05);
            color: #e5e7eb;
          }
          .hidden-history-item.active {
            background: rgba(79, 70, 229, 0.15);
            color: #e5e7eb;
            border-left: 3px solid #4f46e5;
          }
          .hidden-history-item-icon { font-size: 12px; }
          .hidden-history-drag-handle {
            font-size: 10px;
            color: #4b5563;
            cursor: grab;
            user-select: none;
            opacity: 0;
            transition: opacity 0.2s;
            letter-spacing: -2px;
            width: 14px;
          }
          .hidden-history-item:hover .hidden-history-drag-handle {
            opacity: 1;
          }
          .hidden-history-item-title {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
          }
          .hidden-history-load-more {
            text-align: center;
            padding: 10px;
            font-size: 12px;
            color: #6b7280;
            cursor: pointer;
            border-radius: 6px;
            margin-top: 4px;
            transition: all 0.2s;
          }
          .hidden-history-load-more:hover {
            background: rgba(255, 255, 255, 0.05);
            color: #e5e7eb;
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
            pointer-events: auto;
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
          .kimi-voyager-context-menu .menu-item.danger {
            color: #ef4444;
          }
          .kimi-voyager-context-menu .menu-item.danger:hover {
            background: rgba(239, 68, 68, 0.15);
          }

          /* Folder top menu */
          .kimi-voyager-folder-menu {
            background: #374151;
            border-radius: 8px;
            padding: 4px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
            min-width: 180px;
            animation: menuFadeIn 0.15s ease;
          }
          .kimi-voyager-folder-menu .menu-item {
            padding: 8px 12px;
            font-size: 13px;
            color: #e5e7eb;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s;
          }
          .kimi-voyager-folder-menu .menu-item:hover {
            background: rgba(255, 255, 255, 0.1);
          }
          .kimi-voyager-folders-menu-btn:hover {
            background: rgba(255, 255, 255, 0.2) !important;
          }

          /* Custom mouse drag ghost */
          .voyager-drag-ghost {
            animation: ghostPopIn 0.1s ease;
          }
          @keyframes ghostPopIn {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
            to { opacity: 0.9; transform: translate(-50%, -50%) scale(1.05); }
          }
        `
      });
      document.head.appendChild(style);
    }

    _clearUICreationRetries() {
      if (this._uiObserver) {
        this._uiObserver.disconnect();
        this._uiObserver = null;
      }
      if (this._uiRetryInterval) {
        clearInterval(this._uiRetryInterval);
        this._uiRetryInterval = null;
      }
    }

    destroy() {
      if (this.dragDropInterval) {
        clearInterval(this.dragDropInterval);
        this.dragDropInterval = null;
      }
      if (this.interceptedDataPollInterval) {
        clearInterval(this.interceptedDataPollInterval);
        this.interceptedDataPollInterval = null;
      }
      this._clearUICreationRetries();
      if (this.container) {
        this.container.remove();
        this.container = null;
      }
      document.querySelectorAll('.kimi-voyager-folders').forEach(el => el.remove());
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
      if (this._initInProgress) return;
      this._initInProgress = true;
      
      try {
        console.log('🚀 Kimi-Timeline v1.1.0 initializing...');
        const url = window.location.href;
        const isChatPage = url.includes('/chat');
        const currentPath = location.pathname;
        
        console.log('📍 URL:', url, 'isChatPage:', isChatPage);

      // 所有 Kimi 页面都初始化 FolderManager（只要侧边栏存在或可能出现）
      if (!this.features.folderManager) {
        this.features.folderManager = new FolderManager();
        await this.features.folderManager.init();
      } else if (!this.features.folderManager.container || !this.features.folderManager.container.isConnected) {
        this.features.folderManager.createUI();
        this.features.folderManager.renderFolders();
      }

      if (isChatPage) {
        if (!this.chatInitialized) {
          this.features.timeline = new Timeline();
          this.features.timeline.init();

          this.features.exportManager = new ExportManager();
          this.features.exportManager.init();

          // 默认无视觉效果
          this.visualEffects.init('none');
          
          this.chatInitialized = true;
          this.lastChatPath = currentPath;
          console.log('✅ Kimi-Timeline chat features initialized');
        } else if (this.lastChatPath !== currentPath) {
          // SPA navigation within chat pages (different conversation)
          this.lastChatPath = currentPath;
          if (this.features.folderManager) {
            this.features.folderManager.updateActiveHighlights();
            if (!this.features.folderManager.container || !this.features.folderManager.container.isConnected) {
              this.features.folderManager.createUI();
              this.features.folderManager.renderFolders();
            }
          }
          console.log('🔄 Kimi-Timeline updated for new conversation');
        }
      } else {
        // 非对话页：只清理 timeline/exportManager，保留 FolderManager
        if (this.chatInitialized) {
          if (this.features.timeline) {
            this.features.timeline.destroy?.();
            this.features.timeline = null;
          }
          if (this.features.exportManager) {
            this.features.exportManager.destroy();
            this.features.exportManager = null;
          }
          this.chatInitialized = false;
          this.lastChatPath = null;
        }
      }

        this.initialized = true;
        console.log('✅ Kimi-Timeline initialized');
      } catch (error) {
        console.error('❌ Kimi-Timeline initialization error:', error);
      } finally {
        this._initInProgress = false;
      }
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

  // 跨标签页同步：当其他标签页修改文件夹数据时自动刷新当前标签页
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.folders) {
        globalState.folders = changes.folders.newValue || [];
        if (voyager.features?.folderManager) {
          voyager.features.folderManager.renderFolders();
        }
      }
    });
  }

  // Handle SPA navigation: intercept history methods + setInterval fallback + MutationObserver
  let lastUrl = location.href;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    window.dispatchEvent(new Event('kimi-voyager-pushstate'));
  };
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event('kimi-voyager-replacestate'));
  };

  const handleNavigation = () => {
    const newUrl = location.href;
    if (newUrl !== lastUrl) {
      lastUrl = newUrl;
      setTimeout(() => voyager.init(), 300);
    }
  };

  window.addEventListener('popstate', handleNavigation);
  window.addEventListener('kimi-voyager-pushstate', handleNavigation);
  window.addEventListener('kimi-voyager-replacestate', handleNavigation);
  window.addEventListener('hashchange', handleNavigation);

  // setInterval fallback: detects URL changes even if pushState interception failed
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      voyager.init();
    }
  }, 1000);

  // MutationObserver to detect sidebar appearance/disappearance on SPA navigation
  const isKimiSite = () => /kimi\.(com|moonshot\.cn)/.test(location.href);
  const sidebarObserver = new MutationObserver(() => {
    if (!isKimiSite()) return;
    if (!voyager.features.folderManager) {
      voyager.init();
    } else {
      const fm = voyager.features.folderManager;
      if (!fm.container || !fm.container.isConnected) {
        console.log('📁 Sidebar container lost, recreating FolderManager UI');
        fm.createUI();
        fm.renderFolders();
      }
      if (location.href.includes('/chat') && !voyager.chatInitialized) {
        voyager.init();
      }
    }
  });
  sidebarObserver.observe(document.body, { childList: true, subtree: true });

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
      case 'getDomHtml':
        // 返回当前页面的完整 DOM HTML（用于从历史页面提取数据）
        try {
          const html = document.documentElement.outerHTML;
          sendResponse({ success: true, html });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
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
