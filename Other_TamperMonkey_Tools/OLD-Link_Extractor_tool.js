// ==UserScript==
// @name         Extract All Links
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Extract every possible link (href, src, CSS backgrounds, onclick handlers, form actions, raw URLs) on the current page, with fallbacks and robust scanning.
// @author       ChatGPT
// @match        *://*/*
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Utility: dedupe an array
    function unique(arr) {
        return [...new Set(arr)];
    }

    // Extract URLs from CSS background-image or other properties
    function extractUrlsFromCss(cssText) {
        const urls = [];
        const regex = /url\((?:"|'|)(.*?)(?:"|'|)\)/g;
        let match;
        while ((match = regex.exec(cssText))) {
            urls.push(match[1]);
        }
        return urls;
    }

    function scanLinks() {
        const urls = [];
        try {
            // <a>, <link>
            document.querySelectorAll('a[href], link[href]').forEach(el => {
                const h = el.getAttribute('href');
                if (h) urls.push(h);
            });

            // src attributes on img, script, iframe, video, audio, source, embed
            document.querySelectorAll('img[src], script[src], iframe[src], video[src], audio[src], source[src], embed[src]').forEach(el => {
                const s = el.getAttribute('src');
                if (s) urls.push(s);
            });

            // form actions
            document.querySelectorAll('form[action]').forEach(el => {
                const a = el.getAttribute('action');
                if (a) urls.push(a);
            });

            // data-href, data-url attributes
            document.querySelectorAll('[data-href], [data-url]').forEach(el => {
                ['data-href', 'data-url'].forEach(attr => {
                    const v = el.getAttribute(attr);
                    if (v) urls.push(v);
                });
            });

            // CSS background-image & style attributes
            document.querySelectorAll('*').forEach(el => {
                try {
                    const style = window.getComputedStyle(el);
                    if (style) {
                        ['background-image', 'background', 'content'].forEach(prop => {
                            const cssText = style.getPropertyValue(prop);
                            if (cssText) {
                                extractUrlsFromCss(cssText).forEach(u => urls.push(u));
                            }
                        });
                    }
                } catch (e) {
                    // ignore CORS or invalid styles
                }
                // inline style attribute
                const inline = el.getAttribute('style');
                if (inline) {
                    extractUrlsFromCss(inline).forEach(u => urls.push(u));
                }
            });

            // onclick handlers and JS-based navigations
            document.querySelectorAll('[onclick]').forEach(el => {
                const js = el.getAttribute('onclick');
                // simple regex for URLs
                const regex = /(https?:\/\/[^\s'"\)]+)/g;
                let m;
                while ((m = regex.exec(js))) {
                    urls.push(m[1]);
                }
            });

            // raw URLs in page HTML
            const html = document.documentElement.innerHTML;
            const urlRegex = /(https?:\/\/[^"'\s>]+)/g;
            let m;
            while ((m = urlRegex.exec(html))) {
                urls.push(m[1]);
            }
        } catch (err) {
            console.error('Error scanning links:', err);
        }
        return unique(urls).filter(u => u && u !== '#');
    }

    // Create UI panel
    function createPanel() {
        const panel = document.createElement('div');
        panel.style.position = 'fixed';
        panel.style.bottom = '10px';
        panel.style.right = '10px';
        panel.style.width = '300px';
        panel.style.maxHeight = '400px';
        panel.style.overflow = 'auto';
        panel.style.background = 'white';
        panel.style.border = '1px solid #888';
        panel.style.zIndex = 99999;
        panel.style.fontSize = '12px';
        panel.style.fontFamily = 'monospace';
        panel.style.padding = '5px';

        const header = document.createElement('div');
        header.textContent = 'Extracted Links';
        header.style.fontWeight = 'bold';
        header.style.marginBottom = '5px';
        panel.appendChild(header);

        const btn = document.createElement('button');
        btn.textContent = 'Scan & Copy';
        btn.style.width = '100%';
        btn.style.marginBottom = '5px';
        panel.appendChild(btn);

        const textarea = document.createElement('textarea');
        textarea.style.width = '100%';
        textarea.style.height = '300px';
        panel.appendChild(textarea);

        btn.addEventListener('click', () => {
            const results = scanLinks();
            textarea.value = results.join('\n');
            // Copy to clipboard
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(textarea.value);
                alert('Links copied to clipboard!');
            } else {
                textarea.select();
                document.execCommand('copy');
                alert('Links copied to clipboard (execCommand)!');
            }
        });

        document.body.appendChild(panel);
    }

    // Wait for DOM ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createPanel();
    } else {
        window.addEventListener('DOMContentLoaded', createPanel);
    }
})();
