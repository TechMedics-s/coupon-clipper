// ==UserScript==
// @name         Betting Site Automator
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Automate betting strategies with advanced monitoring and controls
// @author       Your name
// @match        http://localhost:8080/test/test-page.html
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// ==/UserScript==

// Polyfill GM functions for direct browser testing
if (typeof GM_addStyle === 'undefined') {
    window.GM_addStyle = function(css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    };
}

if (typeof GM_notification === 'undefined') {
    window.GM_notification = function(details) {
        alert(details.text);
    };
}

(function() {
    'use strict';

    // Styles for the GUI
    const styles = `
        .betting-automator-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 350px;
            background: #1a1a1a;
            color: #ffffff;
            border: 1px solid #00ffff;
            box-shadow: 0 0 10px #00ffff;
            z-index: 9999999;
            font-family: 'Courier New', monospace;
            padding: 10px;
            border-radius: 5px;
            max-height: 90vh;
            overflow-y: auto;
        }

        .automator-header {
            cursor: move;
            padding: 5px;
            background: #2a2a2a;
            border-bottom: 1px solid #00ffff;
            margin: -10px -10px 10px -10px;
            border-radius: 5px 5px 0 0;
        }

        .web-monitor-button {
            background: #2a2a2a;
            color: #ffffff;
            border: 1px solid #00ffff;
            padding: 5px 10px;
            margin: 5px;
            cursor: pointer;
            border-radius: 3px;
            transition: all 0.3s ease;
        }

        .web-monitor-button:hover {
            background: #3a3a3a;
            box-shadow: 0 0 5px #9932cc;
        }

        .element-highlight {
            position: absolute;
            background: rgba(0, 255, 0, 0.2);
            border: 2px solid #00ff00;
            pointer-events: none;
            z-index: 9999998;
            transition: all 0.2s ease;
        }

        .monitor-warning {
            color: #ff0000;
            font-size: 12px;
            text-align: center;
            padding: 5px;
            background: #2a2a2a;
            border-radius: 3px;
            margin-top: 10px;
        }

        .condition-editor {
            margin-top: 15px;
            padding: 10px;
            background: #2a2a2a;
            border-radius: 5px;
        }

        .condition-editor h3 {
            margin: 0 0 10px 0;
            color: #00ffff;
            text-align: center;
        }

        .monitor-section,
        .condition-section,
        .action-section,
        .settings-section {
            margin: 10px 0;
        }

        .condition-editor select,
        .condition-editor input {
            background: #1a1a1a;
            color: #ffffff;
            border: 1px solid #00ffff;
            padding: 5px;
            margin: 5px 0;
            border-radius: 3px;
            width: 100%;
        }

        .action-item {
            display: flex;
            gap: 5px;
            margin: 5px 0;
        }

        .action-item select {
            flex: 1;
        }

        .action-item input {
            flex: 2;
        }

        .remove-action {
            padding: 2px 5px;
            background: #ff4444;
            border: none;
            color: white;
            border-radius: 3px;
            cursor: pointer;
        }
    `;

    // GUI Class
    class BettingAutomator {
        constructor() {
            this.panel = null;
            this.isSelecting = false;
            this.selectedElements = {
                betAmount: null,
                result: null,
                hiButton: null,
                loButton: null,
                balance: null
            };
            
            // Auto-detect elements on our test page
            if (window.location.href.includes('test-page.html')) {
                this.selectedElements = {
                    betAmount: document.getElementById('betAmount'),
                    result: document.getElementById('result'),
                    hiButton: document.querySelector('button[onclick="placeBet(\'hi\')"]'),
                    loButton: document.querySelector('button[onclick="placeBet(\'lo\')"]'),
                    balance: document.getElementById('balance') || { textContent: '10000' }
                };
            }
            this.config = {
                baseBet: 0.00000001,
                maxBet: 0.00001,
                stopLoss: -0.0001,
                stopWin: 0.0001,
                strategy: 'martingale',
                multiplier: 2,
                waitTime: 100,
                maxConsecutiveLosses: 8
            };
            this.stats = {
                wins: 0,
                losses: 0,
                consecutiveLosses: 0,
                highestBet: 0,
                totalProfit: 0,
                startBalance: 0,
                currentBalance: 0
            };
            this.isRunning = false;
            this.currentBet = this.config.baseBet;
            this.lastBetType = 'hi';
            this.init();
        }

        init() {
            // Add styles
            GM_addStyle(styles);

            // Create main panel
            this.panel = this.createPanel();
            document.body.appendChild(this.panel);

            // Make panel draggable
            this.makeDraggable(this.panel);
        }

        createPanel() {
            const panel = document.createElement('div');
            panel.className = 'betting-automator-panel';

            // Add header
            const header = document.createElement('div');
            header.className = 'automator-header';
            header.textContent = 'Betting Automator';
            panel.appendChild(header);

            // Setup Section
            const setupDiv = document.createElement('div');
            setupDiv.className = 'setup-section';
            setupDiv.innerHTML = `
                <div class="setup-buttons">
                    <button class="setup-btn" id="selectBetAmount">Set Bet Input</button>
                    <button class="setup-btn" id="selectResult">Set Result Field</button>
                    <button class="setup-btn" id="selectHiButton">Set Hi Button</button>
                    <button class="setup-btn" id="selectLoButton">Set Lo Button</button>
                    <button class="setup-btn" id="selectBalance">Set Balance Field</button>
                </div>
            `;
            
            // Bind setup button events
            setupDiv.querySelectorAll('.setup-btn').forEach(btn => {
                btn.onclick = () => this.startElementSelection();
            });
            panel.appendChild(setupDiv);

            // Strategy Configuration
            const configDiv = document.createElement('div');
            configDiv.className = 'config-section';
            configDiv.innerHTML = `
                <h3>Strategy Settings</h3>
                <div class="config-grid">
                    <label>Base Bet:</label>
                    <input type="number" id="baseBet" value="${this.config.baseBet}" step="0.00000001">
                    
                    <label>Max Bet:</label>
                    <input type="number" id="maxBet" value="${this.config.maxBet}" step="0.00000001">
                    
                    <label>Stop Loss:</label>
                    <input type="number" id="stopLoss" value="${this.config.stopLoss}" step="0.00000001">
                    
                    <label>Stop Win:</label>
                    <input type="number" id="stopWin" value="${this.config.stopWin}" step="0.00000001">
                    
                    <label>Strategy:</label>
                    <select id="strategy">
                        <option value="martingale">Martingale</option>
                        <option value="fibonacci">Fibonacci</option>
                        <option value="dalembert">D'Alembert</option>
                        <option value="labouchere">Labouchere</option>
                    </select>

                    <label>Wait Time (ms):</label>
                    <input type="number" id="waitTime" value="${this.config.waitTime}" min="100">
                    
                    <label>Max Losses:</label>
                    <input type="number" id="maxLosses" value="${this.config.maxConsecutiveLosses}" min="1">
                </div>

                <div class="stats-section">
                    <div>Wins: <span id="winCount">0</span></div>
                    <div>Losses: <span id="lossCount">0</span></div>
                    <div>Profit: <span id="profitAmount">0.00000000</span></div>
                    <div>Current Streak: <span id="currentStreak">0</span></div>
                    <div>Highest Bet: <span id="highestBet">0.00000000</span></div>
                </div>

                <button class="control-btn" id="startStop">Start Automation</button>
            `;
            panel.appendChild(configDiv);

            // Add warning banner
            const warning = document.createElement('div');
            warning.className = 'warning-banner';
            warning.textContent = 'Use at your own risk. Not responsible for losses.';
            panel.appendChild(warning);

            return panel;
        }

        makeDraggable(element) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            const header = element.querySelector('.automator-header');

            header.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                element.style.top = (element.offsetTop - pos2) + "px";
                element.style.left = (element.offsetLeft - pos1) + "px";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        }

        startElementSelection() {
            this.isSelecting = true;
            this.createHighlightOverlay();

            // Add mouseover event listener
            document.addEventListener('mouseover', this.handleMouseOver.bind(this));
            document.addEventListener('click', this.handleClick.bind(this), true);
        }

        createHighlightOverlay() {
            if (!this.highlightOverlay) {
                this.highlightOverlay = document.createElement('div');
                this.highlightOverlay.className = 'element-highlight';
                document.body.appendChild(this.highlightOverlay);
            }
        }

        handleMouseOver(e) {
            if (!this.isSelecting) return;

            const target = e.target;
            if (target === this.panel || this.panel.contains(target)) return;

            const rect = target.getBoundingClientRect();
            this.highlightOverlay.style.top = rect.top + window.scrollY + 'px';
            this.highlightOverlay.style.left = rect.left + window.scrollX + 'px';
            this.highlightOverlay.style.width = rect.width + 'px';
            this.highlightOverlay.style.height = rect.height + 'px';
        }

        handleClick(e) {
            if (!this.isSelecting) return;

            e.preventDefault();
            e.stopPropagation();

            const target = e.target;
            if (target === this.panel || this.panel.contains(target)) return;

            this.selectedElement = target;
            this.isSelecting = false;

            // Clean up event listeners
            document.removeEventListener('mouseover', this.handleMouseOver.bind(this));
            document.removeEventListener('click', this.handleClick.bind(this), true);

            // Remove highlight overlay
            if (this.highlightOverlay) {
                this.highlightOverlay.remove();
                this.highlightOverlay = null;
            }

            // Store the selected element's information
            this.storeElementInfo(target);
        }

        storeElementInfo(element) {
            // Get unique selector for the element
            const selector = this.generateSelector(element);
            console.log('Selected element:', selector);
            
            // Create condition editor interface
            this.showConditionEditor(element, selector);
        }

        showConditionEditor(element, selector) {
            // Clear any existing condition editor
            const existingEditor = this.panel.querySelector('.condition-editor');
            if (existingEditor) {
                existingEditor.remove();
            }
            
            // Store the current selector
            this.currentSelector = selector;
            const editorContainer = document.createElement('div');
            editorContainer.className = 'condition-editor';
            editorContainer.innerHTML = `
                <h3>Configure Monitoring</h3>
                <div class="monitor-section">
                    <label>Monitor Type:</label>
                    <select id="monitorType">
                        <option value="value">Value</option>
                        <option value="presence">Element Presence</option>
                        <option value="text">Text Content</option>
                    </select>
                </div>
                <div class="condition-section">
                    <label>Condition:</label>
                    <select id="condition">
                        <option value="less">Less than</option>
                        <option value="greater">Greater than</option>
                        <option value="equals">Equals</option>
                        <option value="contains">Contains</option>
                    </select>
                    <input type="text" id="conditionValue" placeholder="Value to compare">
                </div>
                <div class="action-section">
                    <h4>Actions when condition is met:</h4>
                    <div id="actionList"></div>
                    <button class="web-monitor-button" id="addActionBtn">Add Action</button>
                </div>
                <div class="settings-section">
                    <label>Check Interval (ms):</label>
                    <input type="number" id="interval" value="1000" min="100">
                    <label>Max Retries:</label>
                    <input type="number" id="maxRetries" value="5" min="1">
                </div>
                <div class="button-section">
                    <button class="web-monitor-button" id="startMonitoringBtn">Start Monitoring</button>
                </div>
            `;

            // Add to panel
            this.panel.appendChild(editorContainer);

            // Initialize action list
            this.initializeActionList();
        }

        initializeActionList() {
            const actionList = document.getElementById('actionList');
            const addActionBtn = document.getElementById('addActionBtn');
            if (addActionBtn) {
                addActionBtn.onclick = () => this.addNewAction();
            }

            // Add start monitoring button handler
            const startBtn = document.getElementById('startMonitoringBtn');
            if (startBtn) {
                startBtn.onclick = () => this.startMonitoring();
            }
        }

        startMonitoring() {
            const config = {
                monitorType: document.getElementById('monitorType').value,
                condition: document.getElementById('condition').value,
                conditionValue: document.getElementById('conditionValue').value,
                interval: parseInt(document.getElementById('interval').value),
                maxRetries: parseInt(document.getElementById('maxRetries').value),
                continuous: false,
                actions: Array.from(document.getElementById('actionList').children).map(actionItem => ({
                    type: actionItem.querySelector('.action-type').value,
                    value: actionItem.querySelector('.action-value').value
                }))
            };

            // Create and start monitor
            const monitor = new ElementMonitor(this.currentSelector, config);
            monitor.start();

            // Update UI
            const startBtn = document.getElementById('startMonitoringBtn');
            startBtn.textContent = 'Monitoring Active';
            startBtn.disabled = true;
        }

        addNewAction() {
            const actionList = document.getElementById('actionList');
            const actionContainer = document.createElement('div');
            actionContainer.className = 'action-item';
            actionContainer.innerHTML = `
                <select class="action-type">
                    <option value="click">Click Element</option>
                    <option value="input">Enter Text</option>
                    <option value="wait">Wait</option>
                </select>
                <input type="text" class="action-value" placeholder="Button selector / Text / Milliseconds">
                <button class="web-monitor-button remove-action">Remove</button>
            `;
            actionList.appendChild(actionContainer);
            
            // Bind remove button event
            const removeBtn = actionContainer.querySelector('.remove-action');
            if (removeBtn) {
                removeBtn.onclick = function() {
                    this.parentElement.remove();
                }
            }
        }

        generateSelector(element) {
            // Simple implementation - can be improved for more robust selection
            if (element.id) return '#' + element.id;
            if (element.className) return '.' + element.className.split(' ').join('.');
            
            let path = [];
            while (element.parentElement) {
                let tag = element.tagName.toLowerCase();
                let siblings = Array.from(element.parentElement.children);
                if (siblings.length > 1) {
                    let index = siblings.indexOf(element) + 1;
                    tag += ':nth-child(' + index + ')';
                }
                path.unshift(tag);
                element = element.parentElement;
            }
            return path.join(' > ');
        }
    }

    // Monitor Class
    class ElementMonitor {
        constructor(selector, config) {
            this.selector = selector;
            this.config = config;
            this.element = null;
            this.observer = null;
            this.checkInterval = null;
            this.retryCount = 0;
        }

        start() {
            this.element = document.querySelector(this.selector);
            if (!this.element) {
                console.warn('Element not found:', this.selector);
                return;
            }

            // Set up mutation observer
            this.observer = new MutationObserver(() => this.checkCondition());
            this.observer.observe(this.element, {
                characterData: true,
                childList: true,
                subtree: true,
                attributes: true
            });

            // Set up interval checks
            this.checkInterval = setInterval(() => this.checkCondition(), this.config.interval);
        }

        stop() {
            if (this.observer) {
                this.observer.disconnect();
            }
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
            }
        }

        async checkCondition() {
            const value = this.getValue();
            if (this.evaluateCondition(value)) {
                await this.executeActions();
                if (!this.config.continuous) {
                    this.stop();
                }
            }
        }

        getValue() {
            switch (this.config.monitorType) {
                case 'value':
                    return parseFloat(this.element.value || this.element.textContent);
                case 'presence':
                    return this.element.style.display !== 'none' && this.element.style.visibility !== 'hidden';
                case 'text':
                    return this.element.textContent.trim();
                default:
                    return null;
            }
        }

        evaluateCondition(value) {
            const target = this.config.conditionValue;
            switch (this.config.condition) {
                case 'less':
                    return value < parseFloat(target);
                case 'greater':
                    return value > parseFloat(target);
                case 'equals':
                    return value == target;
                case 'contains':
                    return value.includes(target);
                default:
                    return false;
            }
        }

        async executeActions() {
            for (const action of this.config.actions) {
                try {
                    await this.executeAction(action);
                } catch (error) {
                    console.error('Action failed:', error);
                    this.retryCount++;
                    if (this.retryCount >= this.config.maxRetries) {
                        console.error('Max retries reached, stopping monitor');
                        this.stop();
                        break;
                    }
                }
            }
        }

        async executeAction(action) {
            switch (action.type) {
                case 'click':
                    const element = document.querySelector(action.value);
                    if (element) {
                        element.click();
                    } else {
                        throw new Error('Element not found for clicking');
                    }
                    break;

                case 'input':
                    const input = document.querySelector(action.value);
                    if (input) {
                        input.value = action.text;
                        input.dispatchEvent(new Event('input'));
                        input.dispatchEvent(new Event('change'));
                    } else {
                        throw new Error('Input element not found');
                    }
                    break;

                case 'wait':
                    await new Promise(resolve => setTimeout(resolve, parseInt(action.value)));
                    break;
            }
        }
    }

    // Initialize the automator when the DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new BettingAutomator());
    } else {
        new BettingAutomator();
    }
})();