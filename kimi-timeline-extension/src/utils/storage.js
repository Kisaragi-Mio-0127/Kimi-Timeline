/**
 * Storage Manager - 管理扩展的本地存储
 */

export class StorageManager {
  constructor() {
    this.storage = chrome.storage.local;
  }

  // 获取数据
  async get(key) {
    try {
      const result = await this.storage.get(key);
      return key ? result[key] : result;
    } catch (error) {
      console.error('Storage get error:', error);
      return null;
    }
  }

  // 设置数据
  async set(data) {
    try {
      await this.storage.set(data);
      return true;
    } catch (error) {
      console.error('Storage set error:', error);
      return false;
    }
  }

  // 删除数据
  async remove(key) {
    try {
      await this.storage.remove(key);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  }

  // 清空所有数据
  async clear() {
    try {
      await this.storage.clear();
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  }

  // 监听存储变化
  onChanged(callback) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      callback(changes, namespace);
    });
  }
}

// 文件夹相关的存储操作
export class FolderStorage {
  constructor(storageManager) {
    this.storage = storageManager;
    this.key = 'folders';
  }

  async getAll() {
    return await this.storage.get(this.key) || [];
  }

  async add(folder) {
    const folders = await this.getAll();
    folder.id = folder.id || Date.now().toString();
    folder.createdAt = Date.now();
    folders.push(folder);
    await this.storage.set({ [this.key]: folders });
    return folder;
  }

  async update(id, updates) {
    const folders = await this.getAll();
    const index = folders.findIndex(f => f.id === id);
    if (index !== -1) {
      folders[index] = { ...folders[index], ...updates, updatedAt: Date.now() };
      await this.storage.set({ [this.key]: folders });
      return folders[index];
    }
    return null;
  }

  async delete(id) {
    const folders = await this.getAll();
    const filtered = folders.filter(f => f.id !== id);
    await this.storage.set({ [this.key]: filtered });
    return true;
  }

  async moveConversation(convId, folderId) {
    const folders = await this.getAll();
    // 从所有文件夹中移除该对话
    folders.forEach(folder => {
      if (folder.conversations) {
        folder.conversations = folder.conversations.filter(c => c.id !== convId);
      }
    });
    // 添加到目标文件夹
    const targetFolder = folders.find(f => f.id === folderId);
    if (targetFolder) {
      targetFolder.conversations = targetFolder.conversations || [];
      targetFolder.conversations.push({ id: convId, addedAt: Date.now() });
    }
    await this.storage.set({ [this.key]: folders });
    return true;
  }
}

// 提示词相关的存储操作
export class PromptStorage {
  constructor(storageManager) {
    this.storage = storageManager;
    this.key = 'prompts';
  }

  async getAll() {
    return await this.storage.get(this.key) || [];
  }

  async add(prompt) {
    const prompts = await this.getAll();
    prompt.id = prompt.id || Date.now().toString();
    prompt.createdAt = Date.now();
    prompts.unshift(prompt);
    await this.storage.set({ [this.key]: prompts });
    return prompt;
  }

  async update(id, updates) {
    const prompts = await this.getAll();
    const index = prompts.findIndex(p => p.id === id);
    if (index !== -1) {
      prompts[index] = { ...prompts[index], ...updates, updatedAt: Date.now() };
      await this.storage.set({ [this.key]: prompts });
      return prompts[index];
    }
    return null;
  }

  async delete(id) {
    const prompts = await this.getAll();
    const filtered = prompts.filter(p => p.id !== id);
    await this.storage.set({ [this.key]: filtered });
    return true;
  }

  async search(query) {
    const prompts = await this.getAll();
    const lowerQuery = query.toLowerCase();
    return prompts.filter(p => 
      p.title?.toLowerCase().includes(lowerQuery) ||
      p.content?.toLowerCase().includes(lowerQuery) ||
      p.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
}
