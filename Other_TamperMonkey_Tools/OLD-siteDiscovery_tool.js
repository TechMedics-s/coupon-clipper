// ==UserScript==
// @name         SiteStructure-Discovery-Tool
// @namespace    https://example.local/sitediscovery
// @version      1.0
// @description  Passive structural mapper: enumerates frontend variables, scripts, resource paths, and hooks fetch/XHR to record API calls. Save JSON locally. AUTHORIZED TESTS ONLY.
// @match        *://*/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // ==== CONFIG ====
  const TOOL_NAME = "SiteStructure-Discovery-Tool";
  const MAX_ENUM_KEYS = 10000;          // cap to avoid infinite loop
  const SENSITIVE_KEY_PATTERNS = [/password/i, /secret/i, /token/i]; // we will *note* but not display sensitive matches
  const UI_STYLE_ID = 'ssd-ui-style';
  const UI_ROOT_ID = 'ssd-ui-root';

  // ==== UTILS ====
  function safeTypeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function isSensitiveKey(key) {
    if (!key) return false;
    return SENSITIVE_KEY_PATTERNS.some(re => re.test(key));
  }

  function safeTry(fn, fallback = undefined) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function uniquePush(arr, v) {
    if (!arr.includes(v)) arr.push(v);
  }

  // ==== UI: minimal collapsible console ====
  function injectUI() {
    if (document.getElementById(UI_ROOT_ID)) return;
    const style = document.createElement('style');
    style.id = UI_STYLE_ID;
    style.textContent = `
      #${UI_ROOT_ID} { position: fixed; right: 12px; bottom: 12px; width: 420px; max-height: 60vh; font-family: monospace; z-index: 2147483647; box-shadow: 0 6px 24px rgba(0,0,0,.6); border-radius:8px; overflow: hidden; background: #fff; color:#111; border:1px solid rgba(0,0,0,.12) }
      #${UI_ROOT_ID} .hdr { display:flex; align-items:center; gap:8px; padding:8px; background:#f3f4f6; border-bottom:1px solid rgba(0,0,0,.06) }
      #${UI_ROOT_ID} .hdr .title { font-weight:700 }
      #${UI_ROOT_ID} .body { padding:8px; font-size:12px; overflow:auto; max-height:42vh }
      #${UI_ROOT_ID} button { margin-right:6px; }
      #${UI_ROOT_ID} .log { white-space: pre-wrap; font-size:11px; color:#111 }
      #${UI_ROOT_ID} .small { font-size:11px; color:#555 }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = UI_ROOT_ID;
    root.innerHTML = `
      <div class="hdr">
        <div class="title">${TOOL_NAME}</div>
        <div style="flex:1"></div>
        <button id="ssd-run">Run</button>
        <button id="ssd-dl">Download JSON</button>
        <button id="ssd-close">Close</button>
      </div>
      <div class="body">
        <div class="log" id="ssd-log">Ready. Press Run.</div>
      </div>
    `;
    document.body.appendChild(root);

    document.getElementById('ssd-close').onclick = () => root.remove();
    document.getElementById('ssd-dl').onclick = () => {
      if (!window.__SSD_LAST_MAP) return alert('No map available. Run first.');
      const blob = new Blob([JSON.stringify(window.__SSD_LAST_MAP, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${location.hostname.replace(/[:\/\\]/g,'_')}_site-structure.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    document.getElementById('ssd-run').onclick = runDiscovery;
  }

  function log(msg) {
    const el = document.getElementById('ssd-log');
    if (!el) return console.log(msg);
    el.textContent = `${new Date().toISOString()} — ${msg}\n` + el.textContent;
  }

  // ==== CORE: enumerators & hooks ====
  function listScripts() {
    const scripts = Array.from(document.scripts || []);
    return scripts.map(s => ({
      src: safeTry(() => s.src || null),
      inline: safeTry(() => s.src ? null : (s.textContent ? s.textContent.slice(0, 1024) : null)),
      async: !!s.async,
      defer: !!s.defer,
      type: s.type || null,
      dataset: safeTry(() => ({...s.dataset}))
    }));
  }

  function enumerateWindowKeys(limit = 2000) {
    const results = [];
    let count = 0;
    for (const key in window) {
      if (count++ > limit) break;
      const safe = safeTry(() => {
        const val = window[key];
        return {
          key,
          type: safeTypeOf(val),
          constructor: safeTry(() => (val && val.constructor && val.constructor.name) || null),
          sizeHint: safeTry(() => (typeof val === 'object' && val !== null && Object.keys(val).length) || (typeof val === 'string' ? val.length : null)),
          isSensitive: isSensitiveKey(key)
        };
      }, { key, type: 'unknown' });
      results.push(safe);
    }
    return results;
  }

  function enumerateDOMPaths(limit = 500) {
    const out = [];
    try {
      const nodes = document.querySelectorAll('*');
      for (let i=0;i<nodes.length && out.length<limit;i++) {
        const n = nodes[i];
        const tag = n.tagName.toLowerCase();
        const id = n.id ? `#${n.id}` : '';
        const classes = n.className ? `.${String(n.className).replace(/\s+/g,'.')}` : '';
        out.push({path: `${tag}${id}${classes}`, textSnippet: (n.textContent || '').slice(0,120)});
      }
    } catch(e){}
/* keep lightweight */
    return out;
  }

  function enumerateResources() {
    const urls = new Set();
    try {
      performance.getEntries().forEach(r => {
        if (r && r.name) urls.add(r.name);
      });
    } catch (e) {}
    return Array.from(urls).slice(0,200);
  }

  function detectWebpackFootprints() {
    const found = [];
    try {
      if (window.__webpack_require__) found.push('__webpack_require__');
      if (window.webpackJsonp) found.push('webpackJsonp');
      if (window.webpackChunk) found.push('webpackChunk');
      if (window.__NEXT_DATA__) found.push('__NEXT_DATA__');
    } catch(e){}
    return found;
  }

  // Live API call capture
  const liveApiCalls = [];
  function hookFetchAndXhr() {
    if (window.__SSD_HOOKED) return;
    window.__SSD_HOOKED = true;

    // Hook fetch
    const nativeFetch = window.fetch;
    if (nativeFetch) {
      window.fetch = async function(input, init) {
        try {
          const url = (typeof input === 'string') ? input : (input && input.url) || '';
          liveApiCalls.push({type:'fetch', url, method: safeTry(()=>init && init.method) || 'GET', time: Date.now()});
        } catch(e){}
        return nativeFetch.apply(this, arguments);
      };
    }

    // Hook XHR
    const nativeXHR = window.XMLHttpRequest;
    if (nativeXHR) {
      function HookedXHR() {
        const xhr = new nativeXHR();
        let _url = null;
        let _method = null;
        const openWrap = xhr.open;
        xhr.open = function(method, url) {
          _url = url; _method = method;
          return openWrap.apply(this, arguments);
        };
        const sendWrap = xhr.send;
        xhr.send = function(body) {
          try { liveApiCalls.push({type:'xhr', url:_url, method:_method, time: Date.now()}); } catch(e){}
          return sendWrap.apply(this, arguments);
        };
        return xhr;
      }
      window.XMLHttpRequest = HookedXHR;
    }
  }

  // Attempt to extract webpack module list if present (best-effort & read-only)
  function tryExtractWebpackModules() {
    const mods = [];
    try {
      // webpackJsonp (older): array push
      if (Array.isArray(window.webpackJsonp)) {
        uniquePush(mods, 'webpackJsonp (array) found');
      }
      // new chunk loader: window.webpackChunk
      if (window.webpackChunk && typeof window.webpackChunk.push === 'function') {
        uniquePush(mods, 'webpackChunk (push) found');
      }
      // __webpack_require__ module keys (cautious)
      if (window.__webpack_require__ && window.__webpack_require__.c) {
        const keys = Object.keys(window.__webpack_require__.c).slice(0,200);
        uniquePush(mods, `__webpack_require__.c keys: ${keys.length}`);
        // don't enumerate module source to avoid heavy operations
      }
    } catch (e){}
    return mods;
  }

  // Generate structural tree
  function buildStructureMap() {
    log('Building structural map (this may be partial for dynamic sites)...');
    const map = {
      url: location.href,
      timestamp: new Date().toISOString(),
      hostname: location.hostname,
      frontend: {
        scripts: listScripts(),
        windowKeys: enumerateWindowKeys(2000),
        domPaths: enumerateDOMPaths(400),
        resources: enumerateResources(),
        webpackFootprints: detectWebpackFootprints(),
        discoveredModules: tryExtractWebpackModules(),
        liveApiCalls: [...liveApiCalls] // snapshot of calls seen so far
      },
      backendCandidates: {
        inferredApis: inferApisFromPerformance(),
        observedCalls: [...liveApiCalls]
      },
      notes: []
    };
    // Add notes if sensitive keys were found among window keys (only notify, not including values)
    const sensitive = map.frontend.windowKeys.filter(k => k.isSensitive).map(k => k.key);
    if (sensitive.length) {
      map.notes.push({warning: 'Potentially sensitive global keys detected (names only)', keys: sensitive});
    }
    window.__SSD_LAST_MAP = map;
    return map;
  }

  // heuristics: infer API endpoints by scanning resource perf entries & inline fetch/XHR recordings
  function inferApisFromPerformance() {
    const candidates = new Set();
    try {
      const entries = performance.getEntriesByType('resource');
      (entries || []).forEach(e => {
        if (!e.name) return;
        const url = e.name;
        const path = url.replace(location.origin, '').split('?')[0];
        // heuristics: REST-like or /api/ path
        if (/\/api\/|\/graphql|\/v[0-9]+\/|\.json$|\/graphql$/.test(path) || /\/api\//i.test(url)) {
          candidates.add(url);
        }
      });
    } catch(e){}
    // add observed live calls
    (liveApiCalls || []).forEach(c => { if (c && c.url) candidates.add(c.url); });
    return Array.from(candidates).slice(0,200);
  }

  // Pretty printer (tree-like textual output)
  function prettyPrint(map) {
    const lines = [];
    lines.push(`SiteStructure Snapshot for ${map.hostname} @ ${map.timestamp}`);
    lines.push('--- FRONTEND:');
    lines.push(`  Scripts: ${map.frontend.scripts.length}`);
    map.frontend.scripts.slice(0,50).forEach(s => {
      lines.push(`    - src: ${s.src || '[inline]'} type:${s.type || 'script'}`);
    });
    lines.push(`  Window Keys (sample): ${map.frontend.windowKeys.length}`);
    map.frontend.windowKeys.slice(0,100).forEach(k => lines.push(`    - ${k.key} : ${k.type} ${k.isSensitive? '(sensitive-name)': ''}`));
    lines.push('  Resources (sample):');
    map.frontend.resources.slice(0,50).forEach(r => lines.push(`    - ${r}`));
    lines.push('--- BACKEND CANDIDATES:');
    map.backendCandidates.inferredApis.slice(0,50).forEach(a => lines.push(`    - ${a}`));
    return lines.join('\n');
  }

  // Main run function
  function runDiscovery() {
    try {
      injectUI();
      log('Initializing hooks and enumerators...');
      hookFetchAndXhr();
      // slight delay to let lazy scripts run if needed (non-blocking)
      setTimeout(() => {
        const map = buildStructureMap();
        const pretty = prettyPrint(map);
        log(pretty);
        // put a short summary into console for easier copying
        console.groupCollapsed('SiteStructure Summary');
        console.log(pretty);
        console.log('Full map saved to window.__SSD_LAST_MAP');
        console.groupEnd();
      }, 600);
    } catch (err) {
      log('ERROR: ' + String(err));
    }
  }

  // Expose the tool in window so you can call from console
  window.SiteStructureDiscovery = {
    run: runDiscovery,
    lastMap: () => window.__SSD_LAST_MAP || null,
    downloadLast: () => {
      if (!window.__SSD_LAST_MAP) return false;
      const blob = new Blob([JSON.stringify(window.__SSD_LAST_MAP, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${location.hostname.replace(/[:\/\\]/g,'_')}_site-structure.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return true;
    }
  };

  // Auto-inject UI so you can click Run
  injectUI();
  log('UI injected. Press Run to perform discovery (authorized tests only).');

})();
