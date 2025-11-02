const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Browser Environment Test Runner for TechMedics Userscript
 * Emulates Tampermonkey environment with GM_* function polyfills
 */
class UserscriptTestRunner {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        console.log('🚀 Initializing browser environment...');
        
        this.browser = await puppeteer.launch({
            headless: false, // Set to true for headless mode
            devtools: true,
            defaultViewport: { width: 1280, height: 800 }
        });

        this.page = await this.browser.newPage();
        
        // Set up GM_* function polyfills
        await this.setupGMFunctions();
        
        // Create a test HTML page
        await this.createTestPage();
        
        console.log('✅ Browser environment ready');
    }

    async setupGMFunctions() {
        // Polyfill Tampermonkey GM_* functions
        await this.page.evaluateOnNewDocument(() => {
            // GM_setValue/GM_getValue polyfill
            const gmStorage = {};
            
            window.GM_setValue = (key, value) => {
                gmStorage[key] = value;
                console.log(`GM_setValue: ${key} =`, value);
            };
            
            window.GM_getValue = (key, defaultValue) => {
                const value = gmStorage[key];
                console.log(`GM_getValue: ${key} =`, value || defaultValue);
                return value || defaultValue;
            };
            
            window.GM_deleteValue = (key) => {
                delete gmStorage[key];
                console.log(`GM_deleteValue: ${key}`);
            };

            // GM_xmlhttpRequest polyfill
            window.GM_xmlhttpRequest = (options) => {
                console.log('GM_xmlhttpRequest:', options);
                
                return fetch(options.url, {
                    method: options.method || 'GET',
                    headers: options.headers,
                    body: options.data
                })
                .then(response => response.text())
                .then(responseText => {
                    if (options.onload) {
                        options.onload({
                            responseText,
                            status: 200,
                            readyState: 4
                        });
                    }
                })
                .catch(error => {
                    if (options.onerror) {
                        options.onerror(error);
                    }
                });
            };

            // GM_addStyle polyfill
            window.GM_addStyle = (css) => {
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
                console.log('GM_addStyle: CSS injected');
            };

            // GM_notification polyfill
            window.GM_notification = (options) => {
                const message = typeof options === 'string' ? options : options.text;
                console.log('GM_notification:', message);
                
                // Create a simple notification div
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #333;
                    color: white;
                    padding: 10px 15px;
                    border-radius: 5px;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                `;
                notification.textContent = message;
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 3000);
            };

            // Mock Firebase for testing
            window.firebase = {
                auth: () => ({
                    currentUser: { uid: 'test-user-123' }
                }),
                database: () => ({
                    ref: (path) => ({
                        once: () => Promise.resolve({
                            exists: () => true,
                            val: () => ({ credits: 100 })
                        })
                    })
                })
            };

            // Mock React for testing
            window.React = { version: '17.0.2' };

            console.log('🔧 GM_* functions polyfilled');
        });
    }

    async createTestPage() {
        const testHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TechMedics Userscript Test Environment</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 20px;
            background: #1e1e1e;
            color: #d4d4d4;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .test-controls {
            background: #252526;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 1px solid #3e3e42;
        }
        .test-button {
            background: #007acc;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px;
            font-size: 14px;
        }
        .test-button:hover {
            background: #005a9e;
        }
        .test-results {
            background: #1a1a1a;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #3e3e42;
            font-family: 'Consolas', 'Monaco', monospace;
            white-space: pre-wrap;
        }
        .status {
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }
        .status.pass { background: #2d5a2d; }
        .status.fail { background: #5a2d2d; }
        .status.skip { background: #5a5a2d; }
        .status.error { background: #5a2d3d; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 TechMedics Userscript Test Environment</h1>
        
        <div class="test-controls">
            <h3>Test Controls</h3>
            <button class="test-button" onclick="runAllTests()">Run All Tests</button>
            <button class="test-button" onclick="runIndividualTest('override')">Test Override</button>
            <button class="test-button" onclick="runIndividualTest('firebase')">Test Firebase</button>
            <button class="test-button" onclick="runIndividualTest('state')">Test State</button>
            <button class="test-button" onclick="runIndividualTest('api')">Test API</button>
            <button class="test-button" onclick="runIndividualTest('race')">Test Race</button>
            <button class="test-button" onclick="runIndividualTest('localStorage')">Test LocalStorage</button>
            <button class="test-button" onclick="runIndividualTest('serviceWorker')">Test ServiceWorker</button>
            <button class="test-button" onclick="runIndividualTest('dom')">Test DOM</button>
            <button class="test-button" onclick="clearResults()">Clear Results</button>
        </div>
        
        <div class="test-results" id="test-results">
            Test results will appear here...
        </div>
    </div>

    <script>
        let testResults = {};
        
        function log(message, type = 'info') {
            const results = document.getElementById('test-results');
            const timestamp = new Date().toLocaleTimeString();
            results.textContent += \`[\${timestamp}] \${type.toUpperCase()}: \${message}\\n\`;
            results.scrollTop = results.scrollHeight;
        }
        
        function displayResults(results) {
            const resultsDiv = document.getElementById('test-results');
            resultsDiv.innerHTML = '<h3>🧪 Test Results</h3>';
            
            Object.entries(results).forEach(([test, result]) => {
                const statusClass = result.toLowerCase().includes('pass') ? 'pass' :
                                   result.toLowerCase().includes('fail') ? 'fail' :
                                   result.toLowerCase().includes('skip') ? 'skip' : 'error';
                
                resultsDiv.innerHTML += \`
                    <div class="status \${statusClass}">
                        <strong>\${test.toUpperCase()}:</strong> \${result}
                    </div>
                \`;
            });
            
            // Also log to console for debugging
            console.table(results);
        }
        
        async function runAllTests() {
            if (typeof window.BypassTester === 'undefined') {
                log('❌ BypassTester not found. Userscript not loaded?', 'error');
                return;
            }
            
            log('🧪 Running all tests...');
            try {
                const results = await window.BypassTester.runTests();
                displayResults(results);
                log('✅ All tests completed');
            } catch (error) {
                log('❌ Test execution failed: ' + error.message, 'error');
            }
        }
        
        async function runIndividualTest(testName) {
            if (typeof window.BypassTester === 'undefined') {
                log('❌ BypassTester not found. Userscript not loaded?', 'error');
                return;
            }
            
            log(\`🧪 Running \${testName} test...\`);
            try {
                const result = await window.BypassTester['test' + testName.charAt(0).toUpperCase() + testName.slice(1)]();
                log(\`✅ \${testName}: \${result}\`);
                testResults[testName] = result;
                displayResults(testResults);
            } catch (error) {
                log(\`❌ \${testName} failed: \${error.message}\`, 'error');
                testResults[testName] = 'ERROR: ' + error.message;
                displayResults(testResults);
            }
        }
        
        function clearResults() {
            document.getElementById('test-results').innerHTML = 'Test results will appear here...';
            testResults = {};
        }
        
        log('🔧 Test environment loaded');
        log('📝 Waiting for userscript to load...');
    </script>
</body>
</html>`;

        // Write test HTML to file
        const testHtmlPath = path.join(__dirname, 'test-environment.html');
        fs.writeFileSync(testHtmlPath, testHtml);
        
        // Load the test page
        await this.page.goto(`file://${testHtmlPath}`);
        console.log('📄 Test page loaded');
    }

    async loadUserscript() {
        const userscriptPath = path.join(__dirname, 'Cleus_Ultimate_Credit_Bypass_v2.0.user.js');
        const userscriptContent = fs.readFileSync(userscriptPath, 'utf8');
        
        // Inject the userscript
        await this.page.evaluateOnNewDocument((script) => {
            // Remove userscript header comments
            const cleanedScript = script.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n/, '');
            eval(cleanedScript);
        }, userscriptContent);
        
        // Reload page to execute the script
        await this.page.reload();
        await this.page.waitForTimeout(2000); // Wait for script to initialize
        
        console.log('📜 Userscript loaded and initialized');
    }

    async runTests() {
        console.log('🧪 Running userscript tests...');
        
        // Check if BypassTester is available
        const bypassTesterExists = await this.page.evaluate(() => {
            return typeof window.BypassTester !== 'undefined';
        });
        
        if (!bypassTesterExists) {
            console.error('❌ BypassTester not found. Userscript failed to load properly.');
            return null;
        }
        
        // Run all tests
        const results = await this.page.evaluate(async () => {
            try {
                return await window.BypassTester.runTests();
            } catch (error) {
                console.error('Test execution error:', error);
                return { error: error.message };
            }
        });
        
        console.log('📊 Test Results:');
        console.table(results);
        
        return results;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            console.log('🧹 Browser closed');
        }
    }
}

// Main execution
async function main() {
    const runner = new UserscriptTestRunner();
    
    try {
        await runner.initialize();
        await runner.loadUserscript();
        
        // Give user time to see the browser, then run tests
        console.log('⏱️  Waiting 3 seconds before running tests...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const results = await runner.runTests();
        
        if (results) {
            console.log('\n✅ Tests completed successfully!');
            
            // Keep browser open for inspection
            console.log('🔍 Browser window remains open for inspection. Press Ctrl+C to exit.');
            await new Promise(resolve => {
                process.on('SIGINT', resolve);
            });
        }
        
    } catch (error) {
        console.error('❌ Test execution failed:', error);
    } finally {
        await runner.cleanup();
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = UserscriptTestRunner;
