// ==UserScript==
// @name         Site Discovery Pro - Storage
// @namespace    https://example.local/sitediscovery-pro
// @version      2.1
// @description  IndexedDB storage implementation for Site Discovery Pro
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

class IndexedDBStorage {
  constructor(domain) {
    this.domain = domain.replace(/[^a-zA-Z0-9]/g, '_');
    this.db = null;
    this.initialized = this.initDB();
    this.CHUNK_SIZE = 1000; // Number of items per chunk
    this.STORES = {
      PAGES: 'pages',
      RESOURCES: 'resources',
      APIS: 'apis',
      SCRIPTS: 'scripts',
      GLOBAL_VARS: 'globalVars',
      FILE_TREE: 'fileTree',
      DISCOVERY_LOG: 'discoveryLog'
    };
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const DB_NAME = `SiteDiscoveryDB_${this.domain}`;
      const DB_VERSION = 1;
      
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores if they don't exist
        Object.values(this.STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
          }
        });
      };
    });
  }

  async getStore(storeName, mode = 'readonly') {
    await this.initialized;
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  async addItem(storeName, item) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.add({ ...item, timestamp: Date.now() });
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }

  async getItem(storeName, id) {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }

  async getAll(storeName, options = {}) {
    const { limit, offset = 0 } = options;
    const store = await this.getStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let results = request.result;
        if (offset) results = results.slice(offset);
        if (limit) results = results.slice(0, limit);
        resolve(results);
      };
      request.onerror = (e) => reject(e);
    });
  }

  async count(storeName) {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }

  async *getChunked(storeName, chunkSize = this.CHUNK_SIZE) {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const items = await this.getAll(storeName, { limit: chunkSize, offset });
      if (items.length === 0) {
        hasMore = false;
      } else {
        yield items;
        offset += items.length;
      }
    }
  }

  async batchAdd(storeName, items) {
    if (!items || items.length === 0) return 0;
    
    const store = await this.getStore(storeName, 'readwrite');
    
    return new Promise((resolve, reject) => {
      const transaction = store.transaction;
      let completed = 0;
      let errors = [];

      transaction.oncomplete = () => {
        if (errors.length > 0) {
          console.warn(`Failed to add ${errors.length} items to ${storeName}`);
        }
        resolve(completed);
      };

      transaction.onerror = (e) => {
        errors.push(e);
        reject(new Error(`Transaction error: ${e}`));
      };

      items.forEach(item => {
        const request = store.add({ 
          ...item, 
          timestamp: item.timestamp || Date.now() 
        });
        
        request.onsuccess = () => completed++;
        request.onerror = (e) => {
          console.error('Error adding item:', e);
          errors.push(e);
        };
      });
    });
  }

  async clearStore(storeName) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }

  async search(storeName, predicate) {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (predicate(cursor.value)) {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = (e) => reject(e);
    });
  }
}

// Export for use in other files
if (typeof window !== 'undefined') {
  window.IndexedDBStorage = IndexedDBStorage;
}
