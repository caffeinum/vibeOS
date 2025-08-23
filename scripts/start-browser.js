const { spawn } = require('child_process');
const path = require('path');
const { WebSocketServer } = require('ws');
const CDP = require('chrome-remote-interface');

// Global WebSocket server and browser instances
const wss = new WebSocketServer({ port: 9223 });
const browserInstances = new Map();

console.log('Starting browser WebSocket server on port 9223...');

// WebSocket server setup
wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', 'http://localhost');
  const instanceId = url.searchParams.get('instanceId') || 'default';

  console.log(`WebSocket connection established for instance: ${instanceId}`);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'init') {
        // Initialize browser instance if not exists
        if (!browserInstances.has(instanceId)) {
          await createBrowserInstance(instanceId);
        }

        const instance = browserInstances.get(instanceId);
        instance.connectedClients.add(ws);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket connection closed for instance: ${instanceId}`);
    const instance = browserInstances.get(instanceId);
    if (instance) {
      instance.connectedClients.delete(ws);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Start Chrome process
async function startChrome() {
  const { spawn } = require('child_process');
  const fs = require('fs');
  const path = require('path');

  // Chrome installation paths to try
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe'
  ];

  let chromePath = null;

  // Find the first available Chrome executable
  for (const potentialPath of chromePaths) {
    try {
      if (fs.existsSync(potentialPath)) {
        chromePath = potentialPath;
        break;
      }
    } catch (error) {
      continue;
    }
  }

  if (!chromePath) {
    console.error('Chrome not found in standard locations. Please install Chrome or Chromium.');
    console.error('Tried paths:', chromePaths.join(', '));
    throw new Error('Chrome not found');
  }

  console.log(`Using Chrome at: ${chromePath}`);

  // Kill any existing Chrome processes on port 9222
  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq Chrome DevTools*"', { stdio: 'ignore' });
  } catch (error) {
    // Ignore errors if no Chrome processes are running
  }

  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--window-size=1280,720',
    '--user-data-dir=/tmp/chrome-profile',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor'
  ], {
    stdio: 'pipe',
    detached: false
  });

  // Log Chrome output for debugging
  chromeProcess.stdout?.on('data', (data) => {
    console.log('Chrome stdout:', data.toString());
  });

  chromeProcess.stderr?.on('data', (data) => {
    console.log('Chrome stderr:', data.toString());
  });

  chromeProcess.on('error', (error) => {
    console.error('Chrome process error:', error);
  });

  chromeProcess.on('exit', (code, signal) => {
    console.log(`Chrome process exited with code ${code}, signal ${signal}`);
  });

  // Wait for Chrome to start and be ready
  console.log('Waiting for Chrome to start...');
  let retries = 10;
  while (retries > 0) {
    try {
      const CDP = require('chrome-remote-interface');
      await CDP({ host: '127.0.0.1', port: 9222 });
      console.log('Chrome is ready and accepting connections');
      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        throw new Error('Chrome failed to start after 10 attempts');
      }
      console.log(`Waiting for Chrome... ${retries} attempts remaining`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return chromeProcess;
}

// Create browser instance
async function createBrowserInstance(instanceId) {
  try {
    const client = await CDP({
      host: '127.0.0.1',
      port: 9222
    });

    // Enable required domains
    await client.Runtime.enable();
    await client.Page.enable();
    await client.Network.enable();
    await client.Input.enable();

    // Navigate to blank page initially
    await client.Page.navigate({ url: 'about:blank' });

    const instance = {
      id: instanceId,
      client,
      connectedClients: new Set()
    };

    browserInstances.set(instanceId, instance);

    // Set up screenshot streaming
    const screenshotInterval = setInterval(async () => {
      try {
        const { data } = await client.Page.captureScreenshot({
          format: 'jpeg',
          quality: 80
        });

        // Send screenshot to all connected clients
        instance.connectedClients.forEach(ws => {
          if (ws.readyState === 1) { // OPEN
            ws.send(JSON.stringify({
              type: 'screenshot',
              data: data,
              timestamp: Date.now()
            }));
          }
        });
      } catch (error) {
        console.error('Screenshot error:', error);
        clearInterval(screenshotInterval);
      }
    }, 100); // 10 FPS

    return instance;
  } catch (error) {
    console.error('Failed to create browser instance:', error);
    throw error;
  }
}

// Initialize Chrome when module loads
let chromeProcess = null;
startChrome().then(process => {
  chromeProcess = process;
  console.log('Chrome started successfully');
}).catch(error => {
  console.error('Failed to start Chrome:', error);
});

// Start Next.js development server
console.log('Starting Next.js development server...');
const nextProcess = spawn('bun', ['run', 'dev'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down servers...');
  if (chromeProcess) {
    chromeProcess.kill();
  }
  wss.close();
  nextProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down servers...');
  if (chromeProcess) {
    chromeProcess.kill();
  }
  wss.close();
  nextProcess.kill('SIGTERM');
  process.exit(0);
});

// Handle process errors
nextProcess.on('error', (error) => {
  console.error('Next.js server error:', error);
});
