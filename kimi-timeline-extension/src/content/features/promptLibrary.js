/**
 * Prompt Library - 提示词库功能
 * 提供提示词的保存、管理和快速插入
 */

import { sendMessage } from '../../utils/messaging.js';
import { createElement, showToast, createModal } from '../../utils/dom.js';

export class PromptLibrary {
  constructor() {
    this.prompts = [];
    this.panel = null;
    this.isOpen = false;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    
    console.log('💡 Initializing Prompt Library...');
    
    await this.loadPrompts();
    this.injectStyles();
    this.addInputButton();
    
    this.isInitialized = true;
  }

  async loadPrompts() {
    try {
      const response = await sendMessage('getPrompts');
      this.prompts = response.data || [];
    } catch (error) {
      console.error('Failed to load prompts:', error);
      this.prompts = [];
    }
  }

  async savePrompts() {
    try {
      await sendMessage('savePrompts', { data: this.prompts });
    } catch (error) {
      console.error('Failed to save prompts:', error);
    }
  }

  addInputButton() {
    // 查找 Kimi 的输入框
    const observer = new MutationObserver(() => {
      const inputContainer = document.querySelector('[data-testid="chat-input"]')?.parentElement;
      if (inputContainer && !inputContainer.querySelector('.kimi-voyager-prompt-btn')) {
        const button = createElement('button', {
          className: 'kimi-voyager-prompt-btn',
          title: '提示词库',
          events: {
            click: () => this.togglePanel()
          },
          children: [
            createElement('span', { text: '💡' })
          ]
        });
        
        inputContainer.appendChild(button);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  createPanel() {
    if (this.panel) return;

    this.panel = createElement('div', {
      className: 'kimi-voyager-prompt-panel',
      children: [
        createElement('div', {
          className: 'kimi-voyager-prompt-panel-header',
          children: [
            createElement('h3', { text: '💡 提示词库' }),
            createElement('button', {
              className: 'close-btn',
              text: '×',
              events: {
                click: () => this.closePanel()
              }
            })
          ]
        }),
        createElement('div', {
          className: 'kimi-voyager-prompt-search',
          children: [
            createElement('input', {
              type: 'text',
              placeholder: '搜索提示词...',
              events: {
                input: (e) => this.searchPrompts(e.target.value)
              }
            })
          ]
        }),
        createElement('div', {
          className: 'kimi-voyager-prompt-list'
        }),
        createElement('div', {
          className: 'kimi-voyager-prompt-panel-footer',
          children: [
            createElement('button', {
              className: 'add-prompt-btn',
              text: '+ 添加提示词',
              events: {
                click: () => this.showAddPromptDialog()
              }
            })
          ]
        })
      ]
    });

    document.body.appendChild(this.panel);
    this.renderPromptList();
  }

  renderPromptList(promptsToRender = this.prompts) {
    const list = this.panel.querySelector('.kimi-voyager-prompt-list');
    list.innerHTML = '';

    if (promptsToRender.length === 0) {
      list.appendChild(createElement('div', {
        className: 'kimi-voyager-prompt-empty',
        text: this.prompts.length === 0 ? '暂无提示词，点击添加' : '未找到匹配的提示词'
      }));
      return;
    }

    promptsToRender.forEach(prompt => {
      const item = createElement('div', {
        className: 'kimi-voyager-prompt-item',
        events: {
          click: () => this.insertPrompt(prompt)
        },
        children: [
          createElement('div', {
            className: 'prompt-header',
            children: [
              createElement('span', {
                className: 'prompt-title',
                text: prompt.title
              }),
              createElement('div', {
                className: 'prompt-actions',
                children: [
                  createElement('button', {
                    className: 'prompt-action-btn',
                    text: '✏️',
                    title: '编辑',
                    events: {
                      click: (e) => {
                        e.stopPropagation();
                        this.editPrompt(prompt);
                      }
                    }
                  }),
                  createElement('button', {
                    className: 'prompt-action-btn',
                    text: '🗑️',
                    title: '删除',
                    events: {
                      click: (e) => {
                        e.stopPropagation();
                        this.deletePrompt(prompt);
                      }
                    }
                  })
                ]
              })
            ]
          }),
          createElement('div', {
            className: 'prompt-preview',
            text: prompt.content.slice(0, 100) + (prompt.content.length > 100 ? '...' : '')
          }),
          prompt.tags?.length > 0 ? createElement('div', {
            className: 'prompt-tags',
            children: prompt.tags.map(tag => createElement('span', {
              className: 'prompt-tag',
              text: tag
            }))
          }) : null
        ]
      });

      list.appendChild(item);
    });
  }

  searchPrompts(query) {
    if (!query.trim()) {
      this.renderPromptList();
      return;
    }

    const filtered = this.prompts.filter(p =>
      p.title.toLowerCase().includes(query.toLowerCase()) ||
      p.content.toLowerCase().includes(query.toLowerCase()) ||
      p.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
    );

    this.renderPromptList(filtered);
  }

  insertPrompt(prompt) {
    const input = document.querySelector('[data-testid="chat-input"] textarea') || 
                  document.querySelector('textarea[placeholder*="发送消息"]');
    
    if (input) {
      // 处理变量替换
      let content = prompt.content;
      const variables = content.match(/\{\{(\w+)\}\}/g);
      
      if (variables) {
        // 有变量需要替换
        this.showVariableDialog(variables, (values) => {
          variables.forEach((v, i) => {
            content = content.replace(v, values[i] || v);
          });
          this.setInputValue(input, content);
        });
      } else {
        this.setInputValue(input, content);
      }
      
      this.closePanel();
      showToast('提示词已插入', 'success');
    }
  }

  setInputValue(input, value) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  showAddPromptDialog(promptToEdit = null) {
    const isEdit = !!promptToEdit;
    
    const modal = createModal({
      title: isEdit ? '编辑提示词' : '添加提示词',
      content: `
        <div class="kimi-voyager-form">
          <div class="form-group">
            <label>标题 *</label>
            <input type="text" id="prompt-title" placeholder="输入提示词标题" value="${isEdit ? promptToEdit.title : ''}">
          </div>
          <div class="form-group">
            <label>内容 *</label>
            <textarea id="prompt-content" rows="6" placeholder="输入提示词内容，使用 {{变量名}} 定义变量">${isEdit ? promptToEdit.content : ''}</textarea>
          </div>
          <div class="form-group">
            <label>标签（用逗号分隔）</label>
            <input type="text" id="prompt-tags" placeholder="例如: 写作, 翻译, 编程" value="${isEdit ? promptToEdit.tags?.join(', ') || '' : ''}">
          </div>
        </div>
      `,
      buttons: [
        { text: '取消', close: true },
        {
          text: isEdit ? '保存' : '添加',
          primary: true,
          onClick: () => {
            const title = document.getElementById('prompt-title').value.trim();
            const content = document.getElementById('prompt-content').value.trim();
            const tagsInput = document.getElementById('prompt-tags').value.trim();
            
            if (!title || !content) {
              showToast('请填写标题和内容', 'error');
              return;
            }
            
            const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];
            
            if (isEdit) {
              promptToEdit.title = title;
              promptToEdit.content = content;
              promptToEdit.tags = tags;
              promptToEdit.updatedAt = Date.now();
            } else {
              this.prompts.unshift({
                id: Date.now().toString(),
                title,
                content,
                tags,
                createdAt: Date.now()
              });
            }
            
            this.savePrompts();
            this.renderPromptList();
            showToast(isEdit ? '提示词已更新' : '提示词已添加', 'success');
          }
        }
      ]
    });
  }

  editPrompt(prompt) {
    this.showAddPromptDialog(prompt);
  }

  async deletePrompt(prompt) {
    if (confirm(`确定要删除提示词 "${prompt.title}" 吗？`)) {
      this.prompts = this.prompts.filter(p => p.id !== prompt.id);
      await this.savePrompts();
      this.renderPromptList();
      showToast('提示词已删除', 'success');
    }
  }

  showVariableDialog(variables, callback) {
    const uniqueVars = [...new Set(variables.map(v => v.replace(/[{}]/g, '')))];
    
    const inputsHtml = uniqueVars.map(v => `
      <div class="form-group">
        <label>${v}</label>
        <input type="text" class="var-input" data-var="${v}" placeholder="输入 ${v} 的值">
      </div>
    `).join('');
    
    const modal = createModal({
      title: '填写变量',
      content: `<div class="kimi-voyager-form">${inputsHtml}</div>`,
      buttons: [
        { text: '取消', close: true },
        {
          text: '插入',
          primary: true,
          onClick: () => {
            const values = uniqueVars.map(v => {
              const input = document.querySelector(`[data-var="${v}"]`);
              return input ? input.value : '';
            });
            callback(values);
          }
        }
      ]
    });
  }

  togglePanel() {
    if (!this.panel) {
      this.createPanel();
    }
    
    this.isOpen = !this.isOpen;
    this.panel.classList.toggle('open', this.isOpen);
    
    if (this.isOpen) {
      this.renderPromptList();
      this.panel.querySelector('input').focus();
    }
  }

  closePanel() {
    this.isOpen = false;
    if (this.panel) {
      this.panel.classList.remove('open');
    }
  }

  injectStyles() {
    const style = createElement('style', {
      text: `
        .kimi-voyager-prompt-btn {
          position: absolute;
          right: 50px;
          bottom: 12px;
          width: 32px;
          height: 32px;
          border: none;
          background: #4f46e5;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: all 0.2s;
          z-index: 100;
        }

        .kimi-voyager-prompt-btn:hover {
          background: #4338ca;
          transform: scale(1.1);
        }

        .kimi-voyager-prompt-panel {
          position: fixed;
          right: -400px;
          top: 0;
          width: 400px;
          height: 100vh;
          background: var(--kimi-voyager-bg, #1f2937);
          box-shadow: var(--kimi-voyager-shadow, -10px 0 40px rgba(0, 0, 0, 0.4));
          z-index: 10000;
          display: flex;
          flex-direction: column;
          transition: right 0.3s ease;
        }

        .kimi-voyager-prompt-panel.open {
          right: 0;
        }

        .kimi-voyager-prompt-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
        }

        .kimi-voyager-prompt-panel-header h3 {
          margin: 0;
          font-size: 18px;
          color: var(--kimi-voyager-text, #e5e7eb);
        }

        .kimi-voyager-prompt-panel-header .close-btn {
          background: none;
          border: none;
          color: var(--kimi-voyager-text-muted, #9ca3af);
          font-size: 24px;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .kimi-voyager-prompt-panel-header .close-btn:hover {
          background: var(--kimi-voyager-bg-hover, rgba(255, 255, 255, 0.1));
          color: var(--kimi-voyager-text, #e5e7eb);
        }

        .kimi-voyager-prompt-search {
          padding: 16px 20px;
          border-bottom: 1px solid var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
        }

        .kimi-voyager-prompt-search input {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
          border-radius: 8px;
          background: var(--kimi-voyager-bg-hover, rgba(255, 255, 255, 0.05));
          color: var(--kimi-voyager-text, #e5e7eb);
          font-size: 14px;
        }

        .kimi-voyager-prompt-search input:focus {
          outline: none;
          border-color: #4f46e5;
        }

        .kimi-voyager-prompt-search input::placeholder {
          color: var(--kimi-voyager-text-muted, #6b7280);
        }

        .kimi-voyager-prompt-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .kimi-voyager-prompt-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--kimi-voyager-text-muted, #6b7280);
          font-size: 14px;
        }

        .kimi-voyager-prompt-item {
          background: var(--kimi-voyager-bg-hover, rgba(255, 255, 255, 0.05));
          border: 1px solid var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .kimi-voyager-prompt-item:hover {
          background: var(--kimi-voyager-bg-hover, rgba(255, 255, 255, 0.08));
          border-color: rgba(79, 70, 229, 0.5);
          transform: translateX(-4px);
        }

        .prompt-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .prompt-title {
          font-weight: 600;
          font-size: 14px;
          color: var(--kimi-voyager-text, #e5e7eb);
        }

        .prompt-actions {
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .kimi-voyager-prompt-item:hover .prompt-actions {
          opacity: 1;
        }

        .prompt-action-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          font-size: 14px;
          opacity: 0.7;
          transition: all 0.2s;
        }

        .prompt-action-btn:hover {
          opacity: 1;
          background: var(--kimi-voyager-bg-hover, rgba(255, 255, 255, 0.1));
        }

        .prompt-preview {
          font-size: 13px;
          color: var(--kimi-voyager-text-muted, #9ca3af);
          line-height: 1.5;
          margin-bottom: 8px;
        }

        .prompt-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .prompt-tag {
          font-size: 11px;
          padding: 3px 8px;
          background: rgba(79, 70, 229, 0.2);
          color: #818cf8;
          border-radius: 4px;
        }

        .kimi-voyager-prompt-panel-footer {
          padding: 16px 20px;
          border-top: 1px solid var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
        }

        .add-prompt-btn {
          width: 100%;
          padding: 12px;
          border: 2px dashed var(--kimi-voyager-border-strong, rgba(255, 255, 255, 0.2));
          background: transparent;
          color: var(--kimi-voyager-text-muted, #9ca3af);
          border-radius: 10px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .add-prompt-btn:hover {
          border-color: #4f46e5;
          color: #4f46e5;
          background: rgba(79, 70, 229, 0.05);
        }

        /* 表单样式 */
        .kimi-voyager-form .form-group {
          margin-bottom: 16px;
        }

        .kimi-voyager-form label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--kimi-voyager-text-muted, #9ca3af);
          margin-bottom: 6px;
        }

        .kimi-voyager-form input,
        .kimi-voyager-form textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--kimi-voyager-border, rgba(255, 255, 255, 0.1));
          border-radius: 8px;
          background: var(--kimi-voyager-bg-hover, rgba(255, 255, 255, 0.05));
          color: var(--kimi-voyager-text, #e5e7eb);
          font-size: 14px;
          font-family: inherit;
        }

        .kimi-voyager-form input:focus,
        .kimi-voyager-form textarea:focus {
          outline: none;
          border-color: #4f46e5;
        }

        .kimi-voyager-form textarea {
          resize: vertical;
          min-height: 100px;
        }
      `
    });
    document.head.appendChild(style);
  }

  destroy() {
    if (this.panel) {
      this.panel.remove();
    }
    this.isInitialized = false;
  }
}
