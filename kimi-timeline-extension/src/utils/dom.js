/**
 * DOM Utilities - DOM 操作工具函数
 */

// 等待元素出现
export function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

// 创建元素
export function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  
  if (options.className) {
    element.className = options.className;
  }
  
  if (options.id) {
    element.id = options.id;
  }
  
  if (options.text) {
    element.textContent = options.text;
  }
  
  if (options.html) {
    element.innerHTML = options.html;
  }
  
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }
  
  if (options.styles) {
    Object.assign(element.style, options.styles);
  }
  
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

// 防抖函数
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 节流函数
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// 检查元素是否在视口内
export function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// 滚动到元素
export function scrollToElement(element, behavior = 'smooth') {
  element.scrollIntoView({ behavior, block: 'center' });
}

// 获取选中的文本
export function getSelectedText() {
  return window.getSelection().toString();
}

// 安全地注入 HTML
export function sanitizeHTML(html) {
  const temp = document.createElement('div');
  temp.textContent = html;
  return temp.innerHTML;
}

// 复制文本到剪贴板
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}

// 创建模态框
export function createModal(options = {}) {
  const overlay = createElement('div', {
    className: 'kimi-voyager-modal-overlay',
    styles: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '999999'
    },
    events: {
      click: (e) => {
        if (e.target === overlay && options.closeOnOverlay !== false) {
          closeModal();
        }
      }
    }
  });

  const modal = createElement('div', {
    className: 'kimi-voyager-modal',
    styles: {
      backgroundColor: 'var(--kimi-voyager-menu-bg, #fff)',
      color: 'var(--kimi-voyager-text, #111827)',
      borderRadius: '12px',
      padding: '24px',
      maxWidth: options.maxWidth || '500px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
    }
  });

  if (options.title) {
    const title = createElement('h2', {
      text: options.title,
      styles: {
        margin: '0 0 16px 0',
        fontSize: '20px',
        fontWeight: '600',
        color: 'var(--kimi-voyager-text, #111827)'
      }
    });
    modal.appendChild(title);
  }

  if (options.content) {
    const content = createElement('div', {
      className: 'kimi-voyager-modal-content',
      html: options.content
    });
    modal.appendChild(content);
  }

  if (options.buttons) {
    const buttonContainer = createElement('div', {
      styles: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'flex-end',
        marginTop: '24px'
      }
    });

    options.buttons.forEach(btn => {
      const button = createElement('button', {
        text: btn.text,
        styles: {
          padding: '10px 20px',
          borderRadius: '8px',
          border: btn.primary ? 'none' : '1px solid var(--kimi-voyager-border-strong, #ddd)',
          backgroundColor: btn.primary ? '#4f46e5' : 'var(--kimi-voyager-menu-bg, #fff)',
          color: btn.primary ? '#fff' : 'var(--kimi-voyager-text, #333)',
          cursor: 'pointer',
          fontSize: '14px'
        },
        events: {
          click: () => {
            if (btn.onClick) btn.onClick();
            if (btn.close !== false) closeModal();
          }
        }
      });
      buttonContainer.appendChild(button);
    });

    modal.appendChild(buttonContainer);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function closeModal() {
    overlay.remove();
    if (options.onClose) options.onClose();
  }

  return {
    element: overlay,
    close: closeModal
  };
}

// 显示提示消息
export function showToast(message, type = 'info', duration = 3000) {
  const toast = createElement('div', {
    className: `kimi-voyager-toast kimi-voyager-toast-${type}`,
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
      transform: 'translateY(100px)',
      opacity: '0',
      transition: 'all 0.3s ease'
    }
  });

  document.body.appendChild(toast);

  // 触发动画
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// 解析 Kimi 对话内容
export function parseKimiConversation() {
  const messages = [];
  const messageElements = document.querySelectorAll('[data-testid="conversation-turn"]');
  
  messageElements.forEach(el => {
    const role = el.querySelector('[data-testid="user-message"]') ? 'user' : 'assistant';
    const contentEl = el.querySelector('[data-testid="message-content"]');
    const content = contentEl ? contentEl.textContent : '';
    
    messages.push({
      role,
      content,
      timestamp: Date.now()
    });
  });

  return {
    title: document.title.replace(' - Kimi', ''),
    url: window.location.href,
    messages,
    exportedAt: Date.now()
  };
}
