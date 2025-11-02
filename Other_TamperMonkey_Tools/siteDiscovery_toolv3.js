// ==UserScript==
// @name         Enhanced Site Discovery Tool Pro v3.0
// @namespace    https://example.local/sitediscovery-pro
// @version      3.0
// @description  Professional site structure discovery with memory optimization, dark UI, and comprehensive mapping
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      *
// @run-at       document-end
// ==/UserScript==

(() => {
  'use strict';

  // ==== CONFIGURATION ====
  const CONFIG = {
    TOOL_NAME: "Site Discovery Pro v3.0",
    UI_ROOT_ID: 'sdp-ui-root-v3',
    STORAGE_PREFIX: 'sdp_v3_',
    CHUNK_SIZE: 100,
    MAX_RECURSION_DEPTH: 50,
    CACHE_DURATION_DAYS: 30,
    DEBOUNCE_SAVE_MS: 3000,
    MAX_PREVIEW_SIZE: 2000,
    STANDARD_GLOBALS_COUNT: 1000
  };

  // ==== MEMORY-OPTIMIZED STORAGE ====
  class ChunkedStorage {
    constructor(domain) {
      this.domain = domain.replace(/[^a-zA-Z0-9]/g, '_');
      this.indexKey = `${CONFIG.STORAGE_PREFIX}index_${this.domain}`;
      this.chunkPrefix = `${CONFIG.STORAGE_PREFIX}chunk_${this.domain}_`;
      this.treeKey = `${CONFIG.STORAGE_PREFIX}tree_${this.domain}`;
      this.metaKey = `${CONFIG.STORAGE_PREFIX}meta_${this.domain}`;
      this.initializeIndex();
    }

    initializeIndex() {
      const index = this.getIndex();
      if (!index) {
        this.saveIndex({
          chunks: [],
          lastChunk: 0,
          created: Date.now(),
          lastUpdated: Date.now()
        });
      }
    }

    getIndex() {
      try {
        const data = GM_getValue(this.indexKey, null);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        console.error('Failed to get index:', e);
        return null;
      }
    }

    saveIndex(index) {
      GM_setValue(this.indexKey, JSON.stringify(index));
    }

    addData(type, items) {
      const index = this.getIndex();
      const chunkId = `${type}_${index.lastChunk}`;
      let chunkKey = this.chunkPrefix + chunkId;
      
      let chunk = this.getChunk(chunkKey) || { type, items: [], created: Date.now() };
      
      items.forEach(item => {
        if (chunk.items.length >= CONFIG.CHUNK_SIZE) {
          this.saveChunk(chunkKey, chunk);
          if (!index.chunks.includes(chunkId)) {
            index.chunks.push(chunkId);
          }
          index.lastChunk++;
          
          const newChunkId = `${type}_${index.lastChunk}`;
          chunkKey = this.chunkPrefix + newChunkId;
          chunk = { type, items: [], created: Date.now() };
        }
        chunk.items.push(item);
      });
      
      this.saveChunk(chunkKey, chunk);
      if (!index.chunks.includes(chunkId)) {
        index.chunks.push(chunkId);
      }
      
      index.lastUpdated = Date.now();
      this.saveIndex(index);
    }

    getChunk(key) {
      try {
        const data = GM_getValue(key, null);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        return null;
      }
    }

    saveChunk(key, chunk) {
      GM_setValue(key, JSON.stringify(chunk));
    }

    getAllData(type) {
      const index = this.getIndex();
      if (!index) return [];
      
      const results = [];
      index.chunks.forEach(chunkId => {
        if (chunkId.startsWith(type)) {
          const chunk = this.getChunk(this.chunkPrefix + chunkId);
          if (chunk && chunk.items) {
            results.push(...chunk.items);
          }
        }
      });
      return results;
    }

    saveTree(tree) {
      GM_setValue(this.treeKey, JSON.stringify(tree));
    }

    getTree() {
      try {
        const data = GM_getValue(this.treeKey, null);
        return data ? JSON.parse(data) : {};
      } catch (e) {
        return {};
      }
    }

    saveMeta(meta) {
      GM_setValue(this.metaKey, JSON.stringify(meta));
    }

    getMeta() {
      try {
        const data = GM_getValue(this.metaKey, null);
        return data ? JSON.parse(data) : {
          uniqueGlobals: {},
          shadowDoms: [],
          webpackModules: [],
          statistics: {}
        };
      } catch (e) {
        return {
          uniqueGlobals: {},
          shadowDoms: [],
          webpackModules: [],
          statistics: {}
        };
      }
    }

    isExpired() {
      const index = this.getIndex();
      if (!index) return true;
      const age = Date.now() - index.created;
      return age > CONFIG.CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;
    }

    clear() {
      const index = this.getIndex();
      if (index) {
        index.chunks.forEach(chunkId => {
          GM_deleteValue(this.chunkPrefix + chunkId);
        });
      }
      GM_deleteValue(this.indexKey);
      GM_deleteValue(this.treeKey);
      GM_deleteValue(this.metaKey);
      this.initializeIndex();
    }
  }

  // ==== DISCOVERY ENGINE WITH LOOP PROTECTION ====
  class SafeDiscoveryEngine {
    constructor(storage) {
      this.storage = storage;
      this.visitedElements = new WeakSet();
      this.visitedUrls = new Set();
      this.recursionDepth = 0;
      this.discoveryQueue = [];
      this.processing = false;
      this.shadowRoots = new Set();
      this.uniqueGlobals = new Map();
      this.standardGlobals = this.captureStandardGlobals();
      this.saveTimeout = null;
    }

    captureStandardGlobals() {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const standardKeys = new Set(Object.keys(iframe.contentWindow));
      document.body.removeChild(iframe);
      return standardKeys;
    }

    async startDiscovery() {
      if (this.processing) return;
      this.processing = true;
      
      try {
        await this.discoverWithLoopProtection(document.documentElement);
        await this.discoverShadowDOMs();
        await this.discoverUniqueGlobals();
        await this.processQueue();
        this.scheduleSave();
      } finally {
        this.processing = false;
      }
    }

    async discoverWithLoopProtection(element, depth = 0) {
      if (depth > CONFIG.MAX_RECURSION_DEPTH) {
        console.warn('Max recursion depth reached at:', element);
        return;
      }
      
      if (!element || this.visitedElements.has(element)) {
        return;
      }
      
      this.visitedElements.add(element);
      
      // Discover resources
      this.discoverElementResources(element);
      
      // Check for shadow root
      if (element.shadowRoot && !this.shadowRoots.has(element.shadowRoot)) {
        this.shadowRoots.add(element.shadowRoot);
        this.discoveryQueue.push({
          type: 'shadow',
          data: {
            host: element.tagName,
            id: element.id,
            mode: element.shadowRoot.mode
          }
        });
        await this.discoverWithLoopProtection(element.shadowRoot, depth + 1);
      }
      
      // Process children
      if (element.children) {
        for (let child of element.children) {
          await this.discoverWithLoopProtection(child, depth + 1);
          
          // Yield periodically to prevent freezing
          if (this.discoveryQueue.length > CONFIG.CHUNK_SIZE) {
            await this.processQueue();
          }
        }
      }
    }

    discoverElementResources(element) {
      const urls = [];
      
      // Get various URL attributes
      ['href', 'src', 'data', 'action'].forEach(attr => {
        const value = element[attr] || element.getAttribute(attr);
        if (value && typeof value === 'string' && !value.startsWith('javascript:')) {
          urls.push(value);
        }
      });
      
      // Check data attributes
      ['data-src', 'data-href', 'data-url'].forEach(attr => {
        const value = element.getAttribute(attr);
        if (value) urls.push(value);
      });
      
      // Process found URLs
      urls.forEach(url => {
        try {
          const normalizedUrl = new URL(url, window.location.origin).href;
          if (!this.visitedUrls.has(normalizedUrl)) {
            this.visitedUrls.add(normalizedUrl);
            this.discoveryQueue.push({
              type: element.tagName === 'SCRIPT' ? 'script' : 'resource',
              url: normalizedUrl
            });
          }
        } catch (e) {
          // Invalid URL
        }
      });
    }

    async discoverShadowDOMs() {
      const allElements = document.querySelectorAll('*');
      
      for (let element of allElements) {
        try {
          if (element.shadowRoot && !this.shadowRoots.has(element.shadowRoot)) {
            this.shadowRoots.add(element.shadowRoot);
            this.discoveryQueue.push({
              type: 'shadow',
              data: {
                host: element.tagName,
                id: element.id,
                mode: element.shadowRoot.mode
              }
            });
            await this.discoverWithLoopProtection(element.shadowRoot, 0);
          }
        } catch (e) {
          // Access denied
        }
      }
    }

    async discoverUniqueGlobals() {
      for (let key in window) {
        if (!this.standardGlobals.has(key) && 
            !key.startsWith('webkit') && 
            !key.startsWith('moz') &&
            !key.startsWith('chrome') &&
            !key.startsWith(CONFIG.STORAGE_PREFIX)) {
          try {
            const value = window[key];
            const type = typeof value;
            
            if (type !== 'function' || this.isInterestingFunction(value)) {
              this.uniqueGlobals.set(key, {
                type,
                sample: this.getSafeValue(value),
                constructor: value?.constructor?.name
              });
            }
          } catch (e) {
            // Access denied
          }
        }
      }
    }

    isInterestingFunction(func) {
      try {
        const str = func.toString();
        return !str.includes('[native code]') && str.length > 50;
      } catch (e) {
        return false;
      }
    }

    getSafeValue(value, maxLength = 100) {
      try {
        const type = typeof value;
        if (value === null || value === undefined) return value;
        if (type === 'string') return value.substring(0, maxLength);
        if (type === 'number' || type === 'boolean') return value;
        if (Array.isArray(value)) return `Array(${value.length})`;
        if (type === 'object') return `Object(${Object.keys(value).length} keys)`;
        return type;
      } catch (e) {
        return 'inaccessible';
      }
    }

    async processQueue() {
      const chunks = {
        resources: [],
        scripts: [],
        shadows: []
      };
      
      while (this.discoveryQueue.length > 0) {
        const batch = this.discoveryQueue.splice(0, CONFIG.CHUNK_SIZE);
        
        for (let item of batch) {
          switch (item.type) {
            case 'resource':
              chunks.resources.push(item.url);
              break;
            case 'script':
              chunks.scripts.push(item.url);
              break;
            case 'shadow':
              chunks.shadows.push(item.data);
              break;
          }
        }
        
        // Save chunks
        for (let [type, items] of Object.entries(chunks)) {
          if (items.length > 0) {
            this.storage.addData(type, items);
            chunks[type] = [];
          }
        }
        
        // Yield to browser
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    scheduleSave() {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = setTimeout(() => this.saveDiscoveries(), CONFIG.DEBOUNCE_SAVE_MS);
    }

    saveDiscoveries() {
      const tree = this.buildTree();
      this.storage.saveTree(tree);
      
      const meta = {
        uniqueGlobals: Object.fromEntries(this.uniqueGlobals),
        shadowDoms: Array.from(this.shadowRoots).map(root => ({
          host: root.host?.tagName,
          mode: root.mode
        })),
        statistics: {
          totalElements: this.visitedElements.size || 0,
          totalUrls: this.visitedUrls.size,
          shadowRoots: this.shadowRoots.size,
          uniqueGlobals: this.uniqueGlobals.size,
          timestamp: Date.now()
        }
      };
      this.storage.saveMeta(meta);
    }

    buildTree() {
      const tree = {};
      const allUrls = [
        ...this.storage.getAllData('resources'),
        ...this.storage.getAllData('scripts')
      ];
      
      allUrls.forEach(url => {
        try {
          const urlObj = new URL(url, location.origin);
          if (urlObj.hostname !== location.hostname) return;
          
          const parts = urlObj.pathname.split('/').filter(p => p);
          
          let current = tree;
          parts.forEach((part, index) => {
            const isLast = index === parts.length - 1;
            const fileExt = isLast ? this.getFileExtension(part) : null;
            
            if (!current[part]) {
              current[part] = {
                type: isLast ? 'file' : 'directory',
                extension: fileExt,
                url: urlObj.href,
                children: isLast ? undefined : {}
              };
            }
            
            if (!isLast && current[part].children) {
              current = current[part].children;
            }
          });
        } catch (e) {
          // Invalid URL
        }
      });
      
      return this.sortTree(tree);
    }

    sortTree(tree) {
      const sorted = {};
      const entries = Object.entries(tree);
      
      entries.sort((a, b) => {
        const aIsDir = a[1].type === 'directory';
        const bIsDir = b[1].type === 'directory';
        
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a[0].localeCompare(b[0]);
      });
      
      entries.forEach(([key, value]) => {
        sorted[key] = value;
        if (value.children) {
          sorted[key].children = this.sortTree(value.children);
        }
      });
      
      return sorted;
    }

    getFileExtension(filename) {
      const match = filename.match(/\.([^.]+)$/);
      return match ? match[1].toLowerCase() : null;
    }
  }

  // ==== ENHANCED UI WITH DARK THEME ====
  class DarkSteampunkUI {
    constructor(engine, storage) {
      this.engine = engine;
      this.storage = storage;
      this.root = null;
      this.currentView = 'tree';
      this.previewCache = new Map();
      this.currentPreview = null;
    }

    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        /* DARK STEAMPUNK THEME */
        :root {
          --sdp-bg-dark: #0a0a0a;
          --sdp-bg-medium: #1a1a1a;
          --sdp-bg-light: #2a2a2a;
          --sdp-text: #e0e0e0;
          --sdp-text-dim: #888888;
          --sdp-cyan: #00e5ff;
          --sdp-violet: #b388ff;
          --sdp-red: #ff5252;
          --sdp-green: #69f0ae;
          --sdp-bronze: #cd7f32;
          --sdp-border: #333333;
          --sdp-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
          --sdp-cyan-glow: 0 0 10px rgba(0, 229, 255, 0.6);
          --sdp-violet-glow: 0 0 15px rgba(179, 136, 255, 0.8);
          --sdp-red-glow: 0 0 20px rgba(255, 82, 82, 0.9);
        }

        #${CONFIG.UI_ROOT_ID} {
          position: fixed;
          right: 20px;
          bottom: 20px;
          width: 700px;
          max-height: 85vh;
          background: var(--sdp-bg-dark);
          border: 2px solid var(--sdp-cyan);
          border-radius: 12px;
          box-shadow: var(--sdp-shadow), var(--sdp-cyan-glow);
          z-index: 2147483647;
          font-family: 'Courier New', monospace;
          color: var(--sdp-text);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: all 0.3s ease;
        }

        #${CONFIG.UI_ROOT_ID}.minimized {
          width: 60px;
          height: 60px;
          border-color: var(--sdp-violet);
          box-shadow: var(--sdp-shadow), var(--sdp-violet-glow);
        }

        #${CONFIG.UI_ROOT_ID} .warning-banner {
          background: linear-gradient(90deg, var(--sdp-red) 0%, var(--sdp-violet) 100%);
          color: white;
          padding: 8px;
          text-align: center;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 1px;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        #${CONFIG.UI_ROOT_ID} .header {
          background: linear-gradient(135deg, var(--sdp-bg-medium) 0%, var(--sdp-bg-dark) 100%);
          padding: 12px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid var(--sdp-cyan);
          box-shadow: 0 2px 10px rgba(0, 229, 255, 0.3);
          cursor: move;
        }

        #${CONFIG.UI_ROOT_ID} .header h2 {
          margin: 0;
          font-size: 16px;
          color: var(--sdp-cyan);
          text-shadow: var(--sdp-cyan-glow);
          font-weight: bold;
        }

        #${CONFIG.UI_ROOT_ID} .header .controls {
          display: flex;
          gap: 8px;
        }

        #${CONFIG.UI_ROOT_ID} .header button {
          background: var(--sdp-bg-light);
          border: 1px solid var(--sdp-border);
          color: var(--sdp-text);
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        #${CONFIG.UI_ROOT_ID} .header button:hover {
          background: var(--sdp-violet);
          border-color: var(--sdp-violet);
          box-shadow: var(--sdp-violet-glow);
        }

        #${CONFIG.UI_ROOT_ID} .tabs {
          background: var(--sdp-bg-medium);
          padding: 10px 20px;
          display: flex;
          gap: 10px;
          border-bottom: 1px solid var(--sdp-border);
        }

        #${CONFIG.UI_ROOT_ID} .tabs button {
          background: transparent;
          border: none;
          color: var(--sdp-text-dim);
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }

        #${CONFIG.UI_ROOT_ID} .tabs button:hover {
          color: var(--sdp-cyan);
        }

        #${CONFIG.UI_ROOT_ID} .tabs button.active {
          background: var(--sdp-bg-light);
          color: var(--sdp-cyan);
          box-shadow: inset 0 0 5px rgba(0, 229, 255, 0.3);
        }

        #${CONFIG.UI_ROOT_ID} .content {
          background: var(--sdp-bg-medium);
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        #${CONFIG.UI_ROOT_ID} .separator {
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--sdp-cyan), transparent);
          margin: 15px 0;
        }

        #${CONFIG.UI_ROOT_ID} .tree-view,
        #${CONFIG.UI_ROOT_ID} .root-map {
          padding: 15px;
          overflow-y: auto;
          flex: 1;
        }

        #${CONFIG.UI_ROOT_ID} .tree-node {
          margin-left: 20px;
          line-height: 1.8;
          cursor: pointer;
          transition: all 0.2s;
        }

        #${CONFIG.UI_ROOT_ID} .tree-node:hover {
          color: var(--sdp-cyan);
          text-shadow: 0 0 5px rgba(0, 229, 255, 0.5);
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.directory > .node-label {
          font-weight: bold;
          color: var(--sdp-cyan);
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.directory > .node-label:before {
          content: '📁 ';
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.directory.open > .node-label:before {
          content: '📂 ';
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.file > .node-label {
          color: var(--sdp-text);
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.file > .node-label:before {
          content: '📄 ';
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.file.script > .node-label {
          color: var(--sdp-green);
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.file.script > .node-label:before {
          content: '📜 ';
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.file.style > .node-label {
          color: var(--sdp-violet);
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.file.style > .node-label:before {
          content: '🎨 ';
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.file.image > .node-label {
          color: var(--sdp-bronze);
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.file.image > .node-label:before {
          content: '🖼️ ';
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.shadow {
          color: var(--sdp-violet);
          font-style: italic;
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.shadow:before {
          content: '👻 ';
        }

        #${CONFIG.UI_ROOT_ID} .tree-node.sensitive {
          color: var(--sdp-red) !important;
          animation: pulse-glow 2s infinite;
        }

        @keyframes pulse-glow {
          0%, 100% { text-shadow: 0 0 5px rgba(255, 82, 82, 0.5); }
          50% { text-shadow: 0 0 20px rgba(255, 82, 82, 1); }
        }

        #${CONFIG.UI_ROOT_ID} .preview {
          position: absolute;
          right: 100%;
          top: 0;
          width: 500px;
          max-width: 90vw;
          max-height: 80vh;
          background: var(--sdp-bg-dark);
          border: 1px solid var(--sdp-cyan);
          border-radius: 6px;
          padding: 12px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        #${CONFIG.UI_ROOT_ID} .preview-title {
          font-weight: bold;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--sdp-border);
          color: var(--sdp-cyan);
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        #${CONFIG.UI_ROOT_ID} .preview-content {
          flex: 1;
          overflow: auto;
          padding: 8px 0;
          font-size: 12px;
          line-height: 1.5;
        }

        #${CONFIG.UI_ROOT_ID} .file-info {
          background: rgba(0, 0, 0, 0.2);
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 10px;
          font-size: 12px;
        }

        #${CONFIG.UI_ROOT_ID} .file-info div {
          margin: 4px 0;
        }

        #${CONFIG.UI_ROOT_ID} .file-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid var(--sdp-border);
        }

        #${CONFIG.UI_ROOT_ID} .btn-small {
          padding: 2px 8px;
          font-size: 11px;
          border-radius: 3px;
          background: var(--sdp-bg-light);
          border: 1px solid var(--sdp-cyan);
          color: var(--sdp-text);
          cursor: pointer;
          transition: all 0.2s;
        }

        #${CONFIG.UI_ROOT_ID} .btn-small:hover {
          background: var(--sdp-cyan);
          color: var(--sdp-bg-dark);
        }

        #${CONFIG.UI_ROOT_ID} .file-content {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
          padding: 10px;
          max-height: 400px;
          overflow: auto;
          font-family: 'Consolas', 'Courier New', monospace;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 12px;
          line-height: 1.4;
        }

        #${CONFIG.UI_ROOT_ID} .file-content pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
        }

        #${CONFIG.UI_ROOT_ID} .directory-info {
          padding: 8px;
        }

        #${CONFIG.UI_ROOT_ID} .file-types {
          margin: 8px 0;
          padding: 8px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }

        #${CONFIG.UI_ROOT_ID} .error {
          color: var(--sdp-red);
          padding: 10px;
          background: rgba(255, 0, 0, 0.1);
          border-radius: 4px;
          margin-top: 10px;
        }

        #${CONFIG.UI_ROOT_ID} .error-details {
          font-size: 11px;
          opacity: 0.8;
          margin-top: 5px;
          white-space: pre-wrap;
          word-break: break-word;
        }

        #${CONFIG.UI_ROOT_ID} .preview-loading {
          padding: 20px;
          text-align: center;
          color: var(--sdp-text-dim);
          font-style: italic;
        }

        /* Make links in previews look nice */
        #${CONFIG.UI_ROOT_ID} a {
          color: var(--sdp-cyan);
          text-decoration: none;
        }

        #${CONFIG.UI_ROOT_ID} a:hover {
          text-decoration: underline;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          #${CONFIG.UI_ROOT_ID} .preview {
            position: fixed;
            top: 20px !important;
            left: 20px !important;
            right: 20px !important;
            bottom: 20px !important;
            width: auto !important;
            max-width: none;
            max-height: none;
            z-index: 9999;
          }

          #${CONFIG.UI_ROOT_ID} .file-content {
            max-height: none;
          }
        }

        #${CONFIG.UI_ROOT_ID}.minimized .warning-banner,
        #${CONFIG.UI_ROOT_ID}.minimized .tabs,
        #${CONFIG.UI_ROOT_ID}.minimized .content,
        #${CONFIG.UI_ROOT_ID}.minimized .header h2,
        #${CONFIG.UI_ROOT_ID}.minimized .header .controls button:not(.minimize-btn) {
          display: none;
        }

        #${CONFIG.UI_ROOT_ID}.minimized .header {
          border: none;
          justify-content: center;
        }
      `;
      document.head.appendChild(style);
    }

    createUI() {
      const root = document.createElement('div');
      root.id = CONFIG.UI_ROOT_ID;
      root.innerHTML = `
        <div class="warning-banner">
          ⚠️ Use of this tool outside of the red team's sandbox in any form is ILLEGAL ⚠️
        </div>
        <div class="header">
          <h2>🔧 ${CONFIG.TOOL_NAME}</h2>
          <div class="controls">
            <button class="refresh-btn" title="Refresh Discovery">🔄</button>
            <button class="export-btn" title="Export Data">💾</button>
            <button class="clear-btn" title="Clear Data">🗑️</button>
            <button class="minimize-btn" title="Minimize">_</button>
            <button class="close-btn" title="Close">✕</button>
          </div>
        </div>
        <div class="tabs">
          <button class="tab-btn active" data-view="tree">🌳 Tree View</button>
          <button class="tab-btn" data-view="rootmap">🗺️ Root Map</button>
          <button class="tab-btn" data-view="stats">📊 Statistics</button>
          <button class="tab-btn" data-view="unique">🔮 Unique Vars</button>
        </div>
        <div class="content">
          <div id="view-container"></div>
        </div>
      `;
      document.body.appendChild(root);
      this.root = root;
    }

    attachEventListeners() {
      const root = this.root;
      
      // Header controls
      root.querySelector('.refresh-btn').onclick = () => this.refreshDiscovery();
      root.querySelector('.export-btn').onclick = () => this.exportData();
      root.querySelector('.clear-btn').onclick = () => this.clearData();
      root.querySelector('.minimize-btn').onclick = () => root.classList.toggle('minimized');
      root.querySelector('.close-btn').onclick = () => root.remove();
      
      // Tab switching
      root.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
          root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentView = btn.dataset.view;
          this.renderView();
        };
      });
      
      // Make draggable
      this.makeDraggable(root);
    }

    makeDraggable(element) {
      const header = element.querySelector('.header');
      let isDragging = false;
      let startX, startY, initialX, initialY;
      
      header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = element.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        document.body.style.userSelect = 'none';
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        element.style.left = `${initialX + dx}px`;
        element.style.top = `${initialY + dy}px`;
        element.style.right = 'auto';
        element.style.bottom = 'auto';
      });
      
      document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.userSelect = '';
      });
    }

    loadCachedTree() {
      if (!this.storage.isExpired()) {
        console.log('Loading cached tree data...');
        this.renderView();
      } else {
        console.log('Cache expired, starting fresh discovery...');
        this.refreshDiscovery();
      }
    }

    renderView() {
      const container = document.getElementById('view-container');
      if (!container) return;
      
      switch (this.currentView) {
        case 'tree':
          this.renderTreeView(container);
          break;
        case 'rootmap':
          this.renderRootMapView(container);
          break;
        case 'stats':
          this.renderStatsView(container);
          break;
        case 'unique':
          this.renderUniqueVarsView(container);
          break;
      }
    }

    renderTreeView(container) {
      const tree = this.storage.getTree();
      
      container.innerHTML = '<div class="tree-view"></div>';
      const treeContainer = container.querySelector('.tree-view');
      
      if (Object.keys(tree).length === 0) {
        treeContainer.innerHTML = '<p style="color: var(--sdp-text-dim);">No resources discovered yet. Click refresh to start discovery.</p>';
        return;
      }
      
      const renderNode = (node, name, parent, path = '') => {
        const div = document.createElement('div');
        div.className = `tree-node ${node.type}`;
        
        // Add file type classes
        if (node.type === 'file' && node.extension) {
          if (['js', 'jsx', 'ts', 'tsx'].includes(node.extension)) {
            div.classList.add('script');
          } else if (['css', 'scss', 'less'].includes(node.extension)) {
            div.classList.add('style');
          } else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(node.extension)) {
            div.classList.add('image');
          }
        }
        
        // Check for sensitive paths
        if (this.isSensitivePath(path + '/' + name)) {
          div.classList.add('sensitive');
        }
        
        const label = document.createElement('div');
        label.className = 'node-label';
        label.textContent = name;
        div.appendChild(label);
        
        if (node.type === 'directory') {
          const childContainer = document.createElement('div');
          childContainer.style.display = 'none';
          div.appendChild(childContainer);
          
          label.onclick = (e) => {
            const isOpen = childContainer.style.display !== 'none';
            childContainer.style.display = isOpen ? 'none' : 'block';
            div.classList.toggle('open', !isOpen);
            
            // Recursive open with Ctrl key
            if (e.ctrlKey && !isOpen) {
              this.recursiveOpen(childContainer);
            }
          };
          
          if (node.children) {
            Object.keys(node.children).forEach(childName => {
              renderNode(node.children[childName], childName, childContainer, path + '/' + name);
            });
          }
        } else {
          label.onclick = () => this.showNodePreview(div);
        }
        
        parent.appendChild(div);
      };
      
      Object.keys(tree).forEach(name => {
        renderNode(tree[name], name, treeContainer);
      });
    }

    recursiveOpen(container, depth = 0) {
      if (depth > 10) return; // Safety limit
      
      container.style.display = 'block';
      container.parentElement.classList.add('open');
      
      container.querySelectorAll('.tree-node.directory > div:last-child').forEach(child => {
        this.recursiveOpen(child, depth + 1);
      });
    }

    renderRootMapView(container) {
      const meta = this.storage.getMeta();
      
      container.innerHTML = `
        <div class="root-map">
          <h3 style="color: var(--sdp-cyan);">Shadow DOMs & Runtime Structures</h3>
          <div class="separator"></div>
          
          <div style="margin: 20px 0;">
            <h4 style="color: var(--sdp-violet);">Shadow Roots (${meta.shadowDoms?.length || 0})</h4>
            ${(meta.shadowDoms || []).map(shadow => `
              <div class="tree-node shadow">
                Shadow Root - Host: ${shadow.host || 'Unknown'} | Mode: ${shadow.mode || 'closed'}
              </div>
            `).join('') || '<p style="color: var(--sdp-text-dim);">No shadow roots discovered</p>'}
          </div>
          
          <div class="separator"></div>
          
          <div style="margin: 20px 0;">
            <h4 style="color: var(--sdp-violet);">Webpack Modules</h4>
            <p style="color: var(--sdp-text-dim);">Webpack module detection coming soon...</p>
          </div>
        </div>
      `;
    }

    renderStatsView(container) {
      const meta = this.storage.getMeta();
      const stats = meta.statistics || {};
      
      container.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <h3>Total Elements</h3>
            <div class="value">${stats.totalElements || 0}</div>
          </div>
          <div class="stat-card">
            <h3>Total URLs</h3>
            <div class="value">${stats.totalUrls || 0}</div>
          </div>
          <div class="stat-card">
            <h3>Shadow Roots</h3>
            <div class="value">${stats.shadowRoots || 0}</div>
          </div>
          <div class="stat-card">
            <h3>Unique Globals</h3>
            <div class="value">${stats.uniqueGlobals || 0}</div>
          </div>
        </div>
      `;
    }

    renderUniqueVarsView(container) {
      const meta = this.storage.getMeta();
      const globals = meta.uniqueGlobals || {};
      
      container.innerHTML = `
        <div class="tree-view">
          <h3 style="color: var(--sdp-cyan);">Unique Global Variables</h3>
          <div class="separator"></div>
          ${Object.entries(globals).map(([name, info]) => `
            <div class="tree-node" style="margin: 10px 0;">
              <strong style="color: var(--sdp-violet);">${name}</strong><br>
              Type: ${info.type}<br>
              ${info.sample ? `Sample: ${JSON.stringify(info.sample).substring(0, 100)}` : ''}
              ${info.constructor ? `Constructor: ${info.constructor}` : ''}
            </div>
          `).join('') || '<p style="color: var(--sdp-text-dim);">No unique globals found</p>'}
        </div>
      `;
    }

    showNodePreview(nodeEl) {
      // Remove any existing preview
      this.hideNodePreview();
      
      // Get node data
      const nodeData = this.getNodeData(nodeEl);
      if (!nodeData) return;
      
      // Create preview element
      const preview = document.createElement('div');
      preview.className = 'preview-panel';
      
      // Add loading state
      preview.innerHTML = `
        <div class="preview-title">
          ${nodeData.type === 'directory' ? '📁' : '📄'} 
          ${nodeData.name || (nodeData.type === 'directory' ? 'Directory' : 'File')}
        </div>
        <div class="preview-content" id="preview-content">
          <div class="preview-loading">Loading...</div>
        </div>
      `;
      
      // Position and show preview
      nodeEl.appendChild(preview);
      this.currentPreview = preview;
      
      // Position the preview to avoid going off-screen
      this.positionPreview(preview);
      
      // Load content based on node type
      const contentEl = preview.querySelector('#preview-content');
      
      if (nodeData.type === 'directory') {
        this.loadDirectoryPreview(nodeData, contentEl);
      } else if (nodeData.url) {
        this.loadFilePreview(nodeData, contentEl);
      }
    }
    
    async loadFilePreview(nodeData, container) {
      try {
        const response = await fetch(nodeData.url, {
          method: 'GET',
          headers: { 'Accept': 'text/plain' },
          credentials: 'include'
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        let content = await response.text();
        
        // Truncate large files
        const isLarge = content.length > 50000; // 50KB
        if (isLarge) {
          content = content.substring(0, 50000) + '\n\n[Content truncated - file too large to display fully]';
        }
        
        // Create a more informative preview
        const fileInfo = `
          <div class="file-info">
            <div><strong>URL:</strong> <a href="${nodeData.url}" target="_blank">Open in new tab</a></div>
            <div><strong>Size:</strong> ${this.formatFileSize(content.length)}${isLarge ? ' (truncated)' : ''}</div>
            <div><strong>Type:</strong> ${response.headers.get('content-type') || 'Unknown'}</div>
            <div class="file-actions">
              <button class="btn btn-small" data-action="view-raw" data-url="${nodeData.url}">View Raw</button>
              <button class="btn btn-small" data-action="copy-url" data-url="${nodeData.url}">Copy URL</button>
            </div>
          </div>
          <div class="file-content">
            <pre>${this.escapeHtml(content)}</pre>
          </div>
        `;
        
        container.innerHTML = fileInfo;
        
        // Add event listeners to action buttons
        container.querySelectorAll('[data-action]').forEach(btn => {
          btn.addEventListener('click', (e) => this.handleFileAction(e));
        });
        
      } catch (error) {
        container.innerHTML = `
          <div class="error">
            Failed to load file: ${error.message}
            <div class="error-details">${error}</div>
          </div>
        `;
      }
    }
    
    loadDirectoryPreview(nodeData, container) {
      const childCount = Object.keys(nodeData.children || {}).length;
      const fileTypes = {};
      
      // Count file types
      const countFileTypes = (node) => {
        if (node.type === 'file') {
          const ext = node.extension || 'other';
          fileTypes[ext] = (fileTypes[ext] || 0) + 1;
        } else if (node.children) {
          Object.values(node.children).forEach(countFileTypes);
        }
      };
      
      countFileTypes(nodeData);
      
      const typeList = Object.entries(fileTypes)
        .map(([ext, count]) => `${ext}: ${count}`)
        .join('<br>');
      
      container.innerHTML = `
        <div class="directory-info">
          <div><strong>Type:</strong> Directory</div>
          <div><strong>Items:</strong> ${childCount}</div>
          ${typeList ? `<div class="file-types"><strong>File Types:</strong><br>${typeList}</div>` : ''}
          <div class="directory-actions">
            <button class="btn btn-small" data-action="browse" data-path="${nodeData.path || ''}">Browse Directory</button>
          </div>
        </div>
      `;
      
      // Add click handler for browse action
      container.querySelector('[data-action="browse"]')?.addEventListener('click', (e) => {
        // This would navigate the tree to show this directory's contents
        this.navigateToPath(nodeData.path);
      });
    }
    
    handleFileAction(e) {
      const action = e.target.getAttribute('data-action');
      const url = e.target.getAttribute('data-url');
      
      switch (action) {
        case 'view-raw':
          window.open(url, '_blank');
          break;
          
        case 'copy-url':
          navigator.clipboard.writeText(url).then(() => {
            const originalText = e.target.textContent;
            e.target.textContent = 'Copied!';
            setTimeout(() => { e.target.textContent = originalText; }, 2000);
          });
          break;
      }
      
      e.stopPropagation();
    }
    
    navigateToPath(path) {
      // Implementation to expand the tree to show the specified path
      console.log('Navigating to path:', path);
      // This would be implemented to expand the tree view to show the specified path
    }
    
    escapeHtml(unsafe) {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
    
    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    positionPreview(preview) {
      const rect = preview.getBoundingClientRect();
      
      // Adjust horizontal position if needed
      if (rect.right > window.innerWidth) {
        preview.style.right = 'auto';
        preview.style.left = '100%';
      }
      
      // Adjust vertical position if needed
      if (rect.bottom > window.innerHeight) {
        preview.style.top = 'auto';
        preview.style.bottom = '0';
      }
    }
    
    hideNodePreview() {
      if (this.currentPreview) {
        this.currentPreview.remove();
        this.currentPreview = null;
      }
    }
    
    getNodeData(nodeEl) {
      // Find the node name element
      const nameEl = nodeEl.querySelector('.node-name');
      if (!nameEl) return null;
      
      // Get basic data from data attributes
      const type = nameEl.getAttribute('data-type') || 'file';
      const path = nameEl.getAttribute('data-path') || '';
      const url = nameEl.getAttribute('data-url') || '';
      const extension = nameEl.getAttribute('data-extension') || '';
      const name = nameEl.textContent || '';
      
      // Get parent node to check for children
      const parentNode = nodeEl.closest('.tree-node');
      const hasChildren = parentNode ? parentNode.querySelector('.node-children') !== null : false;
      
      // Check if this is a sensitive node
      const isSensitive = nodeEl.closest('.sensitive') !== null;
      
      return {
        type,
        name,
        path,
        url,
        extension,
        hasChildren,
        isSensitive
      };
    }

    refreshDiscovery() {
      console.log('Starting discovery...');
      this.engine.startDiscovery();
      this.renderView();
    }

    exportData() {
      const data = {
        tree: this.storage.getTree(),
        meta: this.storage.getMeta(),
        resources: this.storage.getAllData('resources'),
        scripts: this.storage.getAllData('scripts'),
        shadows: this.storage.getAllData('shadows'),
        timestamp: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `site-discovery-${location.hostname}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    clearData() {
      if (confirm('Clear all discovery data for this domain?')) {
        this.storage.clear();
        this.renderView();
      }
    }
  }

  // ==== INITIALIZATION ====
  function initialize() {
    // Initialize storage and engine
    const domain = window.location.hostname;
    const storage = new ChunkedStorage(domain);
    const engine = new SafeDiscoveryEngine(storage);
    const ui = new DarkSteampunkUI(engine, storage);

    // Initialize UI
    ui.injectStyles();
    ui.createUI();
    ui.attachEventListeners();

    // Expose to window for debugging
    window.SiteDiscoveryPro = {
      engine,
      ui,
      storage,
      startDiscovery: () => engine.startDiscovery(),
      getTree: () => storage.getTree(),
      clearData: () => {
        storage.clearAll();
        ui.clearData();
      }
    };
  }

  // Start when ready with retry logic
  function attemptInitialization(attempt = 0) {
    try {
      initialize();
    } catch (error) {
      console.error(`Initialization attempt ${attempt + 1} failed:`, error);
      if (attempt < 1) { // Only retry once
        console.log('Retrying initialization in 250ms...');
        setTimeout(() => attemptInitialization(attempt + 1), 250);
      } else {
        console.error('Max initialization attempts reached');
      }
    }
  }

  // Start initialization based on document state
  if (document.readyState === 'loading') {
    // If page is still loading, wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', () => attemptInitialization(0));
  } else {
    // If page is already interactive or complete, initialize immediately
    attemptInitialization(0);
  }
})();