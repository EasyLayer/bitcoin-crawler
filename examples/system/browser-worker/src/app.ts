/**
 * Window-side app — runs in the browser tab.
 * Connects to the SharedWorker via SharedWorkerClient from transport-sdk.
 * Vite bundles this with browser conditions, no separate client-entry.ts needed.
 */
import { Client } from '@easylayer/transport-sdk';

const client = new Client({
  transport: {
    type: 'shared-worker',
    options: {
      // '/worker.js' — absolute path from the server root.
      // Vite build outputs worker.ts → dist/worker.js (root of outDir).
      // Both dev (vite serve) and prod (vite preview) serve it at /worker.js.
      url: '/worker.js',
      queryTimeoutMs: 15_000,
    },
  },
});

let liveInterval: ReturnType<typeof setInterval> | null = null;

function log(msg: string) {
  const el = document.getElementById('log')!;
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.prepend(div);
  while (el.children.length > 80) el.removeChild(el.lastChild!);
}

async function queryBalance() {
  const input = document.getElementById('addresses') as HTMLInputElement;
  const addresses = input.value.split(',').map((s) => s.trim()).filter(Boolean);

  log(`→ GetBalanceQuery { addresses: [${addresses.join(', ')}] }`);
  try {
    const result = await client.query('GetBalanceQuery', { addresses });
    document.getElementById('result')!.textContent = JSON.stringify(result, null, 2);
    log(`← ${JSON.stringify(result)}`);
  } catch (e: any) {
    document.getElementById('result')!.textContent = '⚠ ' + e.message;
    log(`← error: ${e.message}`);
  }
}

function toggleLive() {
  const btn = document.getElementById('btn-live')!;
  if (liveInterval) {
    clearInterval(liveInterval);
    liveInterval = null;
    btn.textContent = '▶ Live (3s)';
    log('Live updates stopped');
  } else {
    queryBalance();
    liveInterval = setInterval(queryBalance, 3000);
    btn.textContent = '⏹ Stop Live';
    log('Live updates started');
  }
}

// Expose to inline onclick handlers in index.html
(window as any).queryBalance = queryBalance;
(window as any).toggleLive = toggleLive;
(window as any).openNewTab = () => window.open(window.location.href, '_blank');

// Wait for SharedWorker to become online (ping → pong)
async function waitForWorker() {
  const statusEl = document.getElementById('status')!;
  const btnQuery = document.getElementById('btn-query') as HTMLButtonElement;

  log('Connecting to SharedWorker...');
  client.ping();

  const deadline = Date.now() + 30_000;
  const check = () => {
    if (client.isOnline()) {
      statusEl.textContent = '✅ SharedWorker ready (crawler running)';
      statusEl.className = 'status ready';
      btnQuery.disabled = false;
      log('SharedWorker online — pong received');
      queryBalance();
      return;
    }
    if (Date.now() < deadline) {
      client.ping();
      setTimeout(check, 1000);
    } else {
      statusEl.textContent = '❌ SharedWorker did not respond';
      log('Timeout waiting for SharedWorker');
    }
  };
  setTimeout(check, 500);
}

waitForWorker();
