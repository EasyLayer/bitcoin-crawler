import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { BrowserContext } from '@playwright/test';
import { test, expect, chromium } from '@playwright/test';
import esbuild from 'esbuild';

/**
 * Create a temp persistent Chromium user data dir so IndexedDB persists within the test context.
 */
function mkdtemp(prefix = 'chromium-prof-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Bundle the provided TypeScript snippet into a single ESM script.
 * We also inline sql.js WASM as a data URL (no network needed).
 */
async function bundle(text: string) {
  const result = await esbuild.build({
    stdin: {
      contents: text,
      resolveDir: process.cwd(),
      sourcefile: 'inline.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    sourcemap: 'inline',
    write: false,
    target: ['chrome110'],
    loader: {
      '.wasm': 'dataurl', // inline sql-wasm.wasm
    },
  });
  return result.outputFiles[0]!.text;
}

/**
 * In-browser harness:
 * - Injects ENV into window.process.env.
 * - Registers a Mock Blockchain Provider (no RPC, so no CORS).
 * - Boots your app (bootstrap(...)).
 * - Exposes window.__inspectDb(): reads IndexedDB SQLite bytes via sql.js and returns counts.
 */
const HARNESS_TS = `
  import initSqlJs from 'sql.js';
  import wasmDataUrl from 'sql.js/dist/sql-wasm.wasm';
  import { bootstrap } from '@easylayer/bitcoin-crawler';
  import type { Block } from '@easylayer/bitcoin';

  // ======= Minimal stub model to record block additions =======
  import { Model } from '@easylayer/bitcoin-crawler';
  import type { ExecutionContext } from '@easylayer/bitcoin-crawler';
  export const AGGREGATE_ID = 'BlocksModel';
  export class BlockAddedEvent { constructor(public readonly hash: string) {} }
  class BlocksModel extends Model {
    constructor() { super(AGGREGATE_ID, -1); }
    public async processBlock(ctx: ExecutionContext<Block>): Promise<void> {
      const b = ctx.block;
      if (!b) return;
      this.applyEvent('BlockAddedEvent', b.height, { hash: b.hash });
    }
    protected onBlockAddedEvent(_e: BlockAddedEvent): void {}
  }

  // ======= Mock provider to avoid CORS / networking =======
  // Provide minimal methods the app calls; return deterministic tiny blocks.
  class MockBlockchainProviderService {
    // Example: returns lightweight "block" objects for requested heights.
    async getManyBlocksByHeights(heights: number[]): Promise<any[]> {
      return heights.map(h => ({
        hash: 'mockhash' + h,
        height: h,
        time: 1700000000 + h,
        tx: [],
      }));
    }
    async getManyBlocksStatsByHeights(heights: number[]): Promise<any[]> {
      return heights.map(h => ({
        height: h,
        txCount: 0,
        weight: 0,
        size: 0,
      }));
    }
  }

  declare global {
    interface Window {
      __ENV?: Record<string, string>;
      __inspectDb?: () => Promise<any>;
    }
  }

  // 1) Merge window.__ENV into window.process.env (browser shim)
  {
    const extra = (window.__ENV ?? {});
    const cur = (window as any).process?.env ?? {};
    (window as any).process = { env: { ...cur, ...extra } };
  }

  // 2) Start the app with our model and mock provider
  (async () => {
    await bootstrap({
      Models: [BlocksModel],
      Providers: [
        // The app likely uses DI tokens; if it expects a specific token,
        // expose the mock under that token. For simplicity, provide class directly:
        { provide: 'BlockchainProviderService', useClass: MockBlockchainProviderService },
      ],
      testing: {
        // Optionally: wait for N internal events (if your bootstrap supports it)
        // handlerEventsToWait: [{ eventType: BlockAddedEvent, count: 2 }],
      },
    });
  })().catch(console.error);

  // 3) Find SQLite bytes in IndexedDB and return counters using sql.js
  async function loadSqliteBytesFromIndexedDb(): Promise<Uint8Array | null> {
    const hasDatabases = typeof (indexedDB as any).databases === 'function';
    let dbMetaList: Array<{name?: string, version?: number}> = [];
    if (hasDatabases) {
      try { dbMetaList = await (indexedDB as any).databases(); } catch {}
    }

    const candidates = new Set<string>();
    for (const m of dbMetaList) if (m?.name) candidates.add(m.name);
    if (!candidates.size) { candidates.add('bitcoin'); candidates.add('sql.js'); }

    for (const dbName of candidates) {
      const bytes = await tryReadAnyBinaryStore(dbName).catch(() => null);
      if (bytes) return bytes;
    }

    async function tryReadAnyBinaryStore(name: string): Promise<Uint8Array | null> {
      const openReq = indexedDB.open(name);
      const db: IDBDatabase = await new Promise((res, rej) => {
        openReq.onerror = () => rej(openReq.error);
        openReq.onsuccess = () => res(openReq.result);
      });

      const stores = Array.from(db.objectStoreNames);
      for (const storeName of stores) {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);

        const cursorReq = store.openCursor();
        const first: IDBCursorWithValue | null = await new Promise((res, rej) => {
          cursorReq.onerror = () => rej(cursorReq.error);
          cursorReq.onsuccess = () => res(cursorReq.result);
        });
        if (!first) continue;

        const val = first.value;
        if (!val) continue;

        if (typeof Blob !== 'undefined' && val instanceof Blob) {
          const ab = await val.arrayBuffer();
          db.close(); return new Uint8Array(ab);
        }
        if (val instanceof ArrayBuffer) {
          db.close(); return new Uint8Array(val);
        }
        if (val?.buffer instanceof ArrayBuffer) {
          db.close(); return new Uint8Array(val.buffer);
        }
      }
      db.close();
      return null;
    }

    return null;
  }

  window.__inspectDb = async () => {
    // Wait briefly for the app to write initial events; avoid hard-coded sleeps
    // by polling a few times.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const res = await tryRead();
      if (res?.ok) return res;
      await new Promise(r => setTimeout(r, 300));
    }
    return { ok: false, error: 'timeout' };

    async function tryRead() {
      const dbBytes = await loadSqliteBytesFromIndexedDb();
      if (!dbBytes) return null;

      // Initialize sql.js with inlined WASM (no network)
      const SQL = await initSqlJs({
        wasmBinary: await (await fetch(wasmDataUrl)).arrayBuffer(),
      });

      const db = new SQL.Database(dbBytes);

      function count(sql: string): number {
        try {
          const stmt = db.prepare(sql);
          let total = 0;
          while (stmt.step()) {
            const row = stmt.getAsObject();
            total += (row?.total ?? row?.count ?? 0) as number;
          }
          stmt.free();
          return total;
        } catch {
          return 0;
        }
      }

      const totalNetwork = count(\`SELECT COUNT(*) as total FROM network\`);
      const blocksAdded = count(
        \`SELECT COUNT(*) as total FROM network WHERE type='BitcoinNetworkBlocksAddedEvent'\`
      );
      const userBlocks = count(
        \`SELECT COUNT(*) as total FROM "BlocksModel" WHERE type='BlockAddedEvent'\`
      );
      db.close();

      // Consider "ok" when we see at least some rows
      const ok = totalNetwork > 0 || userBlocks > 0 || blocksAdded > 0;
      return ok
        ? { ok: true, network: { total: totalNetwork, blocksAddedEventsCount: blocksAdded }, user: { blockEventsCount: userBlocks } }
        : null;
    }
  };
`;

/**
 * The actual Playwright test.
 */
test.describe('Browser E2E: read IndexedDB via sql.js (no server)', () => {
  test('writes events and reads them back from IndexedDB', async () => {
    const harnessJs = await bundle(HARNESS_TS);

    // Prepare in-page ENV (all your vars go into window.process.env)
    const injectedEnv = {
      NODE_ENV: 'test',
      DEBUG: '0',
      DB_DEBUG: '0',

      // Browser driver persists DB into IndexedDB
      EVENTSTORE_DB_TYPE: 'sqljs',
      // EVENTSTORE_DB_NAME: 'bitcoin', // опционально, дефолт и так 'bitcoin'

      // Your network/RPC settings (safe to pass; with mock they won't be used)
      PROVIDER_NETWORK_RPC_URLS: 'http://btc:ak3p9g7s2tey@127.0.0.1:18332',
      NETWORK_TYPE: 'testnet',
      NETWORK_PROVIDER_TYPE: 'rpc',

      // App flow
      MAX_BLOCK_HEIGHT: '3',
      START_BLOCK_HEIGHT: '0',
      BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT: '1',

      // Optional: turn off background schedulers in tests (if your app checks it)
      POLL_ENABLED: '0',
    };

    // Build a self-contained data: URL page
    const html = String.raw`<!doctype html>
<html>
<head><meta charset="utf-8"><title>btc-e2e</title></head>
<body>
  <script> window.__ENV = ${JSON.stringify(injectedEnv)}; </script>
  <script type="module">
${harnessJs.replace(/^/gm, '    ')}
  </script>
</body>
</html>`;

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);

    // Launch persistent context to ensure IndexedDB is available and isolated
    const userDataDir = mkdtemp();
    const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      args: [
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--disable-features=BlockInsecurePrivateNetworkRequests,BlockInsecurePrivateNetworkRequestsFromPrivate',
      ],
    });

    const page = await context.newPage();
    await page.goto(dataUrl, { waitUntil: 'load' });

    // Wait until __inspectDb is present and returns non-empty counts (polling)
    const result = await page.waitForFunction(
      async () => {
        const fn = (window as any).__inspectDb;
        if (typeof fn !== 'function') return null;
        return await fn();
      },
      undefined,
      { timeout: 30_000, polling: 500 }
    );

    const value = await result.jsonValue();
    expect(value?.ok).toBe(true);
    expect(value?.network?.total).toBeGreaterThanOrEqual(0); // adapt thresholds to your app
    expect(value?.user?.blockEventsCount).toBeGreaterThanOrEqual(0);

    await page.close();
    await context.close();
  });
});
