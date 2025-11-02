// ==UserScript==
// @name         Enhanced Site Discovery Tool Pro
// @namespace    https://example.local/sitediscovery-pro
// @version      2.0
// @description  Professional site structure discovery with persistence, tree/explorer views, and comprehensive mapping
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_download
// @run-at       document-end
// ==/UserScript==

(() => {
  'use strict';

  // ==== CONFIG ====
  const TOOL_NAME = "Site Discovery Pro";
  const STORAGE_KEY_PREFIX = 'sdp_';
  const MAX_STORAGE_AGE_DAYS = 30;
  const UI_ROOT_ID = 'sdp-ui-root';

  // ==== STORAGE MANAGER ====
  class PersistentStorage {
    constructor(domain) {
      this.domain = domain.replace(/[^a-zA-Z0-9]/g, '_');
      this.storageKey = `${STORAGE_KEY_PREFIX}${this.domain}`;
    }

    load() {
      try {
        const data = GM_getValue(this.storageKey, null);
        if (!data) return this.createEmpty();
        
        const parsed = JSON.parse(data);
        // Check age and reset if too old
        const age = Date.now() - new Date(parsed.firstSeen).getTime();
        if (age > MAX_STORAGE_AGE_DAYS * 24 * 60 * 60 * 1000) {
          return this.createEmpty();
        }
        return parsed;
      } catch (e) {
        console.error('Storage load error:', e);
        return this.createEmpty();
      }
    }

    save(data) {
      try {
        GM_setValue(this.storageKey, JSON.stringify(data));
        return true;
      } catch (e) {
        console.error('Storage save error:', e);
        return false;
      }
    }

    createEmpty() {
      return {
        domain: this.domain,
        firstSeen: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        pages: {},
        resources: new Set(),
        apis: new Set(),
        scripts: new Set(),
        globalVars: {},
        fileTree: {},
        discoveryLog: []
      };
    }

    merge(newData, existingData) {
      // Intelligent merging that adds new discoveries without overwriting
      const merged = { ...existingData };
      merged.lastUpdated = new Date().toISOString();

      // Merge pages
      Object.keys(newData.pages || {}).forEach(path => {
        if (!merged.pages[path]) {
          merged.pages[path] = newData.pages[path];
        } else {
          // Merge page data
          merged.pages[path] = {
            ...merged.pages[path],
            ...newData.pages[path],
            resources: [...new Set([...(merged.pages[path].resources || []), ...(newData.pages[path].resources || [])])],
            lastVisited: new Date().toISOString()
          };
        }
      });

      // Merge sets
      ['resources', 'apis', 'scripts'].forEach(key => {
        merged[key] = new Set([...Array.from(existingData[key] || []), ...Array.from(newData[key] || [])]);
      });

      // Merge global vars with timestamps
      Object.keys(newData.globalVars || {}).forEach(varName => {
        if (!merged.globalVars[varName]) {
          merged.globalVars[varName] = [];
        }
        merged.globalVars[varName].push({
          value: newData.globalVars[varName],
          url: location.href,
          timestamp: new Date().toISOString()
        });
      });

      // Update file tree
      this.updateFileTree(merged);

      return merged;
    }

    updateFileTree(data) {
      const tree = {};
      
      // Build tree from all discovered URLs
      const allUrls = new Set([
        ...Array.from(data.resources || []),
        ...Array.from(data.apis || []),
        ...Array.from(data.scripts || []),
        ...Object.keys(data.pages || {})
      ]);

      allUrls.forEach(url => {
        try {
          const urlObj = new URL(url, location.origin);
          if (urlObj.hostname === location.hostname) {
            const parts = urlObj.pathname.split('/').filter(p => p);
            let current = tree;
            
            parts.forEach((part, index) => {
              if (!current[part]) {
                current[part] = {
                  type: index === parts.length - 1 ? 'file' : 'directory',
                  children: {},
                  metadata: {
                    fullPath: '/' + parts.slice(0, index + 1).join('/'),
                    url: urlObj.href,
                    discovered: new Date().toISOString()
                  }
                };
              }
              if (index < parts.length - 1) {
                current = current[part].children;
              }
            });
          }
        } catch (e) {
          // Invalid URL, skip
        }
      });

      data.fileTree = tree;
    }
  }

  // ==== DISCOVERY ENGINE ====
  class DiscoveryEngine {
    constructor(storage) {
      this.storage = storage;
      this.discoveries = storage.load();
      this.observers = [];
    }

    startDiscovery() {
      this.discoverCurrentPage();
      this.hookNetworkCalls();
      this.observeDOMChanges();
      this.scanGlobalScope();
      this.discoverResources();
    }

    discoverCurrentPage() {
      const pageData = {
        url: location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        resources: [],
        forms: [],
        links: []
      };

      // Discover all links
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        if (href && !href.startsWith('javascript:')) {
          pageData.links.push(href);
          this.discoveries.resources.add(href);
        }
      });

      // Discover forms
      document.querySelectorAll('form').forEach(form => {
        pageData.forms.push({
          action: form.action,
          method: form.method,
          inputs: Array.from(form.querySelectorAll('input')).map(i => ({
            name: i.name,
            type: i.type,
            id: i.id
          }))
        });
      });

      // Discover resources
      this.discoverPageResources(pageData);

      // Store page data
      this.discoveries.pages[location.pathname] = pageData;
    }

    discoverPageResources(pageData) {
      // Images, scripts, stylesheets, etc.
      const selectors = [
        'img[src]', 'script[src]', 'link[href]', 'iframe[src]',
        'video[src]', 'audio[src]', 'source[src]', 'embed[src]',
        'object[data]'
      ];

      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          const url = el.src || el.href || el.data;
          if (url) {
            pageData.resources.push(url);
            this.discoveries.resources.add(url);
            
            // Track scripts separately
            if (el.tagName === 'SCRIPT') {
              this.discoveries.scripts.add(url);
            }
          }
        });
      });

      // Check for data attributes with URLs
      document.querySelectorAll('[data-src], [data-href], [data-url]').forEach(el => {
        ['data-src', 'data-href', 'data-url'].forEach(attr => {
          const val = el.getAttribute(attr);
          if (val && val.startsWith('http')) {
            pageData.resources.push(val);
            this.discoveries.resources.add(val);
          }
        });
      });
    }

    hookNetworkCalls() {
      // Hook fetch
      const originalFetch = window.fetch;
      window.fetch = (...args) => {
        const url = typeof args[0] === 'string' ? args[0] : args[0].url;
        this.discoveries.apis.add(url);
        this.logDiscovery('API Call (fetch)', url);
        return originalFetch.apply(window, args);
      };

      // Hook XMLHttpRequest
      const XHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.discoveries.apis.add(url);
        this.logDiscovery('API Call (XHR)', url);
        return XHROpen.apply(this, arguments);
      };
    }

    observeDOMChanges() {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
              this.scanElement(node);
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      this.observers.push(observer);
    }

    scanElement(element) {
      // Scan newly added elements for resources
      const resources = [];
      
      if (element.src) resources.push(element.src);
      if (element.href) resources.push(element.href);
      if (element.data) resources.push(element.data);
      
      element.querySelectorAll('[src], [href], [data]').forEach(el => {
        if (el.src) resources.push(el.src);
        if (el.href) resources.push(el.href);
        if (el.data) resources.push(el.data);
      });

      resources.forEach(url => {
        if (url && !this.discoveries.resources.has(url)) {
          this.discoveries.resources.add(url);
          this.logDiscovery('Dynamic Resource', url);
        }
      });
    }

    scanGlobalScope() {
      const globalVars = {};
      const standardGlobals = new Set(Object.keys(window.frames[window.frames.length - 1] || {}));

      Object.keys(window).forEach(key => {
        if (!standardGlobals.has(key) && !key.startsWith('webkit') && !key.startsWith('moz')) {
          try {
            const value = window[key];
            const type = typeof value;
            
            if (type !== 'function' && key !== this.storage.storageKey) {
              globalVars[key] = {
                type,
                sample: this.getSampleValue(value),
                constructor: value?.constructor?.name
              };
            }
          } catch (e) {
            // Access denied or circular reference
          }
        }
      });

      this.discoveries.globalVars = { ...this.discoveries.globalVars, ...globalVars };
    }

    getSampleValue(value) {
      const type = typeof value;
      
      if (value === null || value === undefined) return value;
      if (type === 'string') return value.substring(0, 100);
      if (type === 'number' || type === 'boolean') return value;
      if (Array.isArray(value)) return `Array(${value.length})`;
      if (type === 'object') return `Object(${Object.keys(value).length} keys)`;
      
      return type;
    }

    discoverResources() {
      // Performance API resources
      if (window.performance && performance.getEntriesByType) {
        performance.getEntriesByType('resource').forEach(entry => {
          this.discoveries.resources.add(entry.name);
        });
      }

      // Scan inline styles for URLs
      document.querySelectorAll('[style]').forEach(el => {
        const style = el.getAttribute('style');
        const urlMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/g);
        if (urlMatch) {
          urlMatch.forEach(match => {
            const url = match.replace(/url\(['"]?|['"]?\)/g, '');
            this.discoveries.resources.add(url);
          });
        }
      });
    }

    logDiscovery(type, detail) {
      this.discoveries.discoveryLog.push({
        type,
        detail,
        url: location.href,
        timestamp: new Date().toISOString()
      });

      // Keep log size manageable
      if (this.discoveries.discoveryLog.length > 1000) {
        this.discoveries.discoveryLog = this.discoveries.discoveryLog.slice(-500);
      }
    }

    save() {
      const existing = this.storage.load();
      const merged = this.storage.merge(this.discoveries, existing);
      this.storage.save(merged);
      this.discoveries = merged;
    }
  }

  // ==== UI MANAGER ====
  class UIManager {
    constructor(engine) {
      this.engine = engine;
      this.currentView = 'tree';
      this.selectedPath = null;
    }

    inject() {
      if (document.getElementById(UI_ROOT_ID)) return;

      const style = document.createElement('style');
      style.textContent = `
        #${UI_ROOT_ID} {
          position: fixed;
          right: 20px;
          bottom: 20px;
          width: 600px;
          max-height: 80vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        #${UI_ROOT_ID}.minimized {
          width: 60px;
          height: 60px;
        }

        #${UI_ROOT_ID} .header {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          padding: 15px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          cursor: move;
        }

        #${UI_ROOT_ID} .header h2 {
          margin: 0;
          color: white;
          font-size: 18px;
          font-weight: 600;
        }

        #${UI_ROOT_ID} .header .controls {
          display: flex;
          gap: 10px;
        }

        #${UI_ROOT_ID} .header button {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        #${UI_ROOT_ID} .header button:hover {
          background: rgba(255,255,255,0.3);
          transform: translateY(-1px);
        }

        #${UI_ROOT_ID} .tabs {
          background: rgba(255,255,255,0.05);
          padding: 10px 20px;
          display: flex;
          gap: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        #${UI_ROOT_ID} .tabs button {
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.7);
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        #${UI_ROOT_ID} .tabs button.active {
          background: rgba(255,255,255,0.2);
          color: white;
        }

        #${UI_ROOT_ID} .content {
          background: rgba(255,255,255,0.95);
          height: 400px;
          overflow: auto;
          padding: 20px;
        }

        #${UI_ROOT_ID} .tree-view {
          font-family: 'Courier New', monospace;
          font-size: 13px;
          color: #333;
        }

        #${UI_ROOT_ID} .tree-node {
          margin-left: 20px;
          line-height: 1.8;
        }

        #${UI_ROOT_ID} .tree-node.directory > .node-label {
          font-weight: 600;
          color: #4a5568;
          cursor: pointer;
        }

        #${UI_ROOT_ID} .tree-node.directory > .node-label:before {
          content: '📁 ';
        }

        #${UI_ROOT_ID} .tree-node.directory.open > .node-label:before {
          content: '📂 ';
        }

        #${UI_ROOT_ID} .tree-node.file > .node-label {
          color: #718096;
          cursor: pointer;
        }

        #${UI_ROOT_ID} .tree-node.file > .node-label:before {
          content: '📄 ';
        }

        #${UI_ROOT_ID} .tree-node.file > .node-label:hover {
          color: #667eea;
          text-decoration: underline;
        }

        #${UI_ROOT_ID} .explorer-view {
          display: flex;
          height: 100%;
        }

        #${UI_ROOT_ID} .explorer-sidebar {
          width: 200px;
          border-right: 1px solid #e2e8f0;
          padding-right: 15px;
          overflow: auto;
        }

        #${UI_ROOT_ID} .explorer-main {
          flex: 1;
          padding-left: 15px;
          overflow: auto;
        }

        #${UI_ROOT_ID} .explorer-item {
          padding: 8px 12px;
          margin: 2px 0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        #${UI_ROOT_ID} .explorer-item:hover {
          background: #f7fafc;
        }

        #${UI_ROOT_ID} .explorer-item.selected {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        #${UI_ROOT_ID} .stats {
          background: #f7fafc;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
        }

        #${UI_ROOT_ID} .stats h3 {
          margin: 0 0 10px 0;
          color: #2d3748;
          font-size: 14px;
          font-weight: 600;
        }

        #${UI_ROOT_ID} .stats .stat-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
          font-size: 13px;
          color: #4a5568;
        }

        #${UI_ROOT_ID} .stats .stat-value {
          font-weight: 600;
          color: #667eea;
        }

        #${UI_ROOT_ID} .resource-list {
          max-height: 300px;
          overflow: auto;
          background: #f7fafc;
          border-radius: 8px;
          padding: 10px;
        }

        #${UI_ROOT_ID} .resource-item {
          padding: 8px;
          margin: 4px 0;
          background: white;
          border-radius: 4px;
          font-size: 12px;
          word-break: break-all;
          cursor: pointer;
          transition: all 0.2s;
        }

        #${UI_ROOT_ID} .resource-item:hover {
          background: #e6fffa;
          transform: translateX(5px);
        }

        #${UI_ROOT_ID}.minimized .header h2,
        #${UI_ROOT_ID}.minimized .header .controls button:not(.minimize-btn),
        #${UI_ROOT_ID}.minimized .tabs,
        #${UI_ROOT_ID}.minimized .content {
          display: none;
        }

        #${UI_ROOT_ID}.minimized .header {
          padding: 15px;
          border: none;
        }

        #${UI_ROOT_ID}.minimized .header .minimize-btn:before {
          content: '🔍';
          font-size: 20px;
        }
      `;
      document.head.appendChild(style);

      const root = document.createElement('div');
      root.id = UI_ROOT_ID;
      root.innerHTML = `
        <div class="header">
          <h2>${TOOL_NAME}</h2>
          <div class="controls">
            <button class="refresh-btn">🔄 Refresh</button>
            <button class="export-btn">💾 Export</button>
            <button class="clear-btn">🗑️ Clear</button>
            <button class="minimize-btn">−</button>
            <button class="close-btn">✕</button>
          </div>
        </div>
        <div class="tabs">
          <button class="tab-btn active" data-view="tree">🌳 Tree View</button>
          <button class="tab-btn" data-view="explorer">📁 Explorer</button>
          <button class="tab-btn" data-view="stats">📊 Statistics</button>
        </div>
        <div class="content">
          <div id="view-container"></div>
        </div>
      `;
      document.body.appendChild(root);

      this.attachEventListeners();
      this.renderView();
    }

    attachEventListeners() {
      const root = document.getElementById(UI_ROOT_ID);
      
      // Header controls
      root.querySelector('.refresh-btn').onclick = () => {
        this.engine.startDiscovery();
        this.engine.save();
        this.renderView();
      };

      root.querySelector('.export-btn').onclick = () => this.exportData();
      
      root.querySelector('.clear-btn').onclick = () => {
        if (confirm('Clear all discovery data for this domain?')) {
          this.engine.storage.save(this.engine.storage.createEmpty());
          this.engine.discoveries = this.engine.storage.load();
          this.renderView();
        }
      };

      root.querySelector('.minimize-btn').onclick = () => {
        root.classList.toggle('minimized');
      };

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

      // Make header draggable
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

    renderView() {
      const container = document.getElementById('view-container');
      if (!container) return;

      switch (this.currentView) {
        case 'tree':
          this.renderTreeView(container);
          break;
        case 'explorer':
          this.renderExplorerView(container);
          break;
        case 'stats':
          this.renderStatsView(container);
          break;
      }
    }

    renderTreeView(container) {
      const tree = this.engine.discoveries.fileTree || {};
      
      container.innerHTML = '<div class="tree-view"></div>';
      const treeContainer = container.querySelector('.tree-view');
      
      if (Object.keys(tree).length === 0) {
        treeContainer.innerHTML = '<p style="color: #718096;">No resources discovered yet. Navigate the site to build the tree.</p>';
        return;
      }

      const renderNode = (node, name, parent) => {
        const div = document.createElement('div');
        div.className = `tree-node ${node.type}`;
        
        const label = document.createElement('div');
        label.className = 'node-label';
        label.textContent = name;
        div.appendChild(label);

        if (node.type === 'directory') {
          const childContainer = document.createElement('div');
          childContainer.style.display = 'none';
          div.appendChild(childContainer);

          label.onclick = () => {
            const isOpen = childContainer.style.display !== 'none';
            childContainer.style.display = isOpen ? 'none' : 'block';
            div.classList.toggle('open', !isOpen);
          };

          Object.keys(node.children).forEach(childName => {
            renderNode(node.children[childName], childName, childContainer);
          });
        } else {
          label.onclick = () => this.handleFileClick(node.metadata);
        }

        parent.appendChild(div);
      };

      Object.keys(tree).forEach(name => {
        renderNode(tree[name], name, treeContainer);
      });
    }

    renderExplorerView(container) {
      container.innerHTML = `
        <div class="explorer-view">
          <div class="explorer-sidebar">
            <div class="explorer-item selected" data-category="pages">📄 Pages (${Object.keys(this.engine.discoveries.pages || {}).length})</div>
            <div class="explorer-item" data-category="resources">🎨 Resources (${this.engine.discoveries.resources?.size || 0})</div>
            <div class="explorer-item" data-category="apis">🔌 APIs (${this.engine.discoveries.apis?.size || 0})</div>
            <div class="explorer-item" data-category="scripts">📜 Scripts (${this.engine.discoveries.scripts?.size || 0})</div>
            <div class="explorer-item" data-category="globals">🌍 Global Vars (${Object.keys(this.engine.discoveries.globalVars || {}).length})</div>
          </div>
          <div class="explorer-main" id="explorer-content"></div>
        </div>
      `;

      const items = container.querySelectorAll('.explorer-item');
      items.forEach(item => {
        item.onclick = () => {
          items.forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          this.renderExplorerContent(item.dataset.category);
        };
      });

      this.renderExplorerContent('pages');
    }

    renderExplorerContent(category) {
      const content = document.getElementById('explorer-content');
      if (!content) return;

      switch (category) {
        case 'pages':
          const pages = Object.entries(this.engine.discoveries.pages || {});
          content.innerHTML = `
            <h3>Discovered Pages</h3>
            <div class="resource-list">
              ${pages.map(([path, data]) => `
                <div class="resource-item">
                  <strong>${path}</strong><br>
                  Title: ${data.title || 'Untitled'}<br>
                  Links: ${data.links?.length || 0}, Forms: ${data.forms?.length || 0}<br>
                  Last visited: ${new Date(data.timestamp).toLocaleString()}
                </div>
              `).join('')}
            </div>
          `;
          break;

        case 'resources':
          const resources = Array.from(this.engine.discoveries.resources || []);
          content.innerHTML = `
            <h3>All Resources</h3>
            <div class="resource-list">
              ${resources.map(url => `
                <div class="resource-item" onclick="window.open('${url}', '_blank')">
                  ${this.truncateUrl(url)}
                </div>
              `).join('')}
            </div>
          `;
          break;

        case 'apis':
          const apis = Array.from(this.engine.discoveries.apis || []);
          content.innerHTML = `
            <h3>API Endpoints</h3>
            <div class="resource-list">
              ${apis.map(url => `
                <div class="resource-item">
                  ${this.truncateUrl(url)}
                </div>
              `).join('')}
            </div>
          `;
          break;

        case 'scripts':
          const scripts = Array.from(this.engine.discoveries.scripts || []);
          content.innerHTML = `
            <h3>JavaScript Files</h3>
            <div class="resource-list">
              ${scripts.map(url => `
                <div class="resource-item" onclick="window.open('${url}', '_blank')">
                  ${this.truncateUrl(url)}
                </div>
              `).join('')}
            </div>
          `;
          break;

        case 'globals':
          const globals = Object.entries(this.engine.discoveries.globalVars || {});
          content.innerHTML = `
            <h3>Global Variables</h3>
            <div class="resource-list">
              ${globals.map(([name, info]) => `
                <div class="resource-item">
                  <strong>${name}</strong><br>
                  Type: ${info.type || 'unknown'}<br>
                  ${info.sample ? `Sample: ${JSON.stringify(info.sample).substring(0, 100)}` : ''}
                </div>
              `).join('')}
            </div>
          `;
          break;
      }
    }

    renderStatsView(container) {
      const data = this.engine.discoveries;
      const stats = {
        pages: Object.keys(data.pages || {}).length,
        resources: data.resources?.size || 0,
        apis: data.apis?.size || 0,
        scripts: data.scripts?.size || 0,
        globals: Object.keys(data.globalVars || {}).length,
        firstSeen: data.firstSeen,
        lastUpdated: data.lastUpdated
      };

      container.innerHTML = `
        <div class="stats">
          <h3>Discovery Statistics</h3>
          <div class="stat-row">
            <span>Domain:</span>
            <span class="stat-value">${location.hostname}</span>
          </div>
          <div class="stat-row">
            <span>Pages Discovered:</span>
            <span class="stat-value">${stats.pages}</span>
          </div>
          <div class="stat-row">
            <span>Total Resources:</span>
            <span class="stat-value">${stats.resources}</span>
          </div>
          <div class="stat-row">
            <span>API Endpoints:</span>
            <span class="stat-value">${stats.apis}</span>
          </div>
          <div class="stat-row">
            <span>Script Files:</span>
            <span class="stat-value">${stats.scripts}</span>
          </div>
          <div class="stat-row">
            <span>Global Variables:</span>
            <span class="stat-value">${stats.globals}</span>
          </div>
          <div class="stat-row">
            <span>First Seen:</span>
            <span class="stat-value">${new Date(stats.firstSeen).toLocaleDateString()}</span>
          </div>
          <div class="stat-row">
            <span>Last Updated:</span>
            <span class="stat-value">${new Date(stats.lastUpdated).toLocaleString()}</span>
          </div>
        </div>
        
        <div class="stats">
          <h3>Recent Discoveries</h3>
          <div class="resource-list">
            ${data.discoveryLog?.slice(-10).reverse().map(log => `
              <div class="resource-item">
                <strong>${log.type}</strong><br>
                ${this.truncateUrl(log.detail)}<br>
                <small>${new Date(log.timestamp).toLocaleTimeString()}</small>
              </div>
            `).join('') || '<p>No recent discoveries</p>'}
          </div>
        </div>
      `;
    }

    handleFileClick(metadata) {
      if (!metadata || !metadata.url) return;
      
      // Try to download or open the file
      const url = metadata.url;
      
      // Check if it's a downloadable resource
      if (this.isDownloadable(url)) {
        this.downloadFile(url);
      } else {
        // Open in new tab
        window.open(url, '_blank');
      }
    }

    isDownloadable(url) {
      const downloadableExtensions = [
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.zip', '.rar', '.tar', '.gz', '.csv', '.json', '.xml',
        '.txt', '.log', '.sql', '.db', '.sqlite'
      ];
      
      const urlLower = url.toLowerCase();
      return downloadableExtensions.some(ext => urlLower.includes(ext));
    }

    downloadFile(url) {
      try {
        // Use GM_download if available
        if (typeof GM_download === 'function') {
          const filename = url.split('/').pop().split('?')[0] || 'download';
          GM_download({
            url: url,
            name: filename,
            saveAs: true
          });
        } else {
          // Fallback to creating a download link
          const a = document.createElement('a');
          a.href = url;
          a.download = url.split('/').pop().split('?')[0] || 'download';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } catch (e) {
        console.error('Download failed:', e);
        // Open in new tab as fallback
        window.open(url, '_blank');
      }
    }

    truncateUrl(url, maxLength = 60) {
      if (url.length <= maxLength) return url;
      
      try {
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search;
        if (path.length > 40) {
          return urlObj.hostname + path.substring(0, 20) + '...' + path.substring(path.length - 20);
        }
        return urlObj.hostname + path;
      } catch (e) {
        return url.substring(0, maxLength - 3) + '...';
      }
    }

    exportData() {
      const data = this.engine.discoveries;
      const exportData = {
        ...data,
        resources: Array.from(data.resources || []),
        apis: Array.from(data.apis || []),
        scripts: Array.from(data.scripts || [])
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `site-discovery-${location.hostname}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // ==== INITIALIZATION ====
  function init() {
    // Create storage manager
    const storage = new PersistentStorage(location.hostname);
    
    // Create discovery engine
    const engine = new DiscoveryEngine(storage);
    
    // Start discovery
    engine.startDiscovery();
    
    // Create UI
    const ui = new UIManager(engine);
    ui.inject();
    
    // Auto-save every 10 seconds
    setInterval(() => {
      engine.save();
    }, 10000);
    
    // Save on page unload
    window.addEventListener('beforeunload', () => {
      engine.save();
    });
    
    // Make available in console
    window.SiteDiscoveryPro = {
      engine,
      ui,
      storage,
      getData: () => engine.discoveries,
      exportData: () => ui.exportData(),
      clearData: () => {
        storage.save(storage.createEmpty());
        engine.discoveries = storage.load();
        ui.renderView();
      }
    };
    
    console.log(`%c${TOOL_NAME} initialized! Access via window.SiteDiscoveryPro`, 'color: #667eea; font-weight: bold;');
  }

  // Start after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();