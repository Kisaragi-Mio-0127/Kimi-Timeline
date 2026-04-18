/**
 * Message Handler - 处理扩展内部的消息传递
 */

export class MessageHandler {
  constructor() {
    this.listeners = new Map();
  }

  // 发送消息到 background script
  async sendToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // 发送消息到 content script
  async sendToContent(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // 广播消息到所有标签页
  async broadcastToAllTabs(message) {
    const tabs = await chrome.tabs.query({ url: 'https://kimi.moonshot.cn/*' });
    const promises = tabs.map(tab => 
      this.sendToContent(tab.id, message).catch(err => {
        console.warn(`Failed to send message to tab ${tab.id}:`, err);
        return null;
      })
    );
    return Promise.all(promises);
  }

  // 监听消息
  onMessage(action, handler) {
    if (!this.listeners.has(action)) {
      this.listeners.set(action, []);
    }
    this.listeners.get(action).push(handler);
  }

  // 处理接收到的消息
  handleMessage(request, sender, sendResponse) {
    const handlers = this.listeners.get(request.action);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(request, sender, sendResponse);
        } catch (error) {
          console.error('Message handler error:', error);
        }
      });
      return true; // 保持消息通道开放
    }
    return false;
  }
}

// 便捷的消息发送函数
export async function sendMessage(action, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && !response.success) {
        reject(new Error(response.error || 'Unknown error'));
      } else {
        resolve(response);
      }
    });
  });
}

// 便捷的消息监听函数
export function onMessage(action, callback) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === action) {
      Promise.resolve(callback(request, sender))
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // 保持消息通道开放
    }
    return false;
  });
}
