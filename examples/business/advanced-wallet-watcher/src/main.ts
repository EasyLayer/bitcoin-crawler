import { resolve } from 'node:path';
import { fork } from 'node:child_process';
import express from 'express';
import { Client } from '@easylayer/transport-sdk';

const child = fork(resolve(process.cwd(), 'src/app.ts'), [], {
  execArgv: ['-r', 'ts-node/register/transpile-only'],
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  env: process.env,
});

const client = new Client({
  transport: { type: 'ipc-parent', options: { child } },
});

client.subscribe('TxSeen', async (event: any) => {
  console.log('TxSeen', event);
});

client.subscribe('TxReplacedByRbf', async (event: any) => {
  console.log('TxReplacedByRbf', event);
});

client.subscribe('DoubleSpendDetected', async (event: any) => {
  console.log('DoubleSpendDetected', event);
});

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// GET /tx-status?txids=txid1,txid2
app.get('/tx-status', async (req, res) => {
  try {
    const q = (req.query.txids as string) || '';
    const txids = q ? q.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (txids.length === 0) return res.status(400).json({ error: 'txids are required' });

    const data = await client.query<any, any>('GetTxStatusQuery', { txids });
    res.status(200).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'internal' });
  }
});

// GET /address-seen?addresses=addr1,addr2
// If addresses omitted => returns map for all watched addresses
app.get('/address-seen', async (req, res) => {
  try {
    const q = (req.query.addresses as string) || '';
    const addresses = q ? q.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const payload = addresses && addresses.length ? { addresses } : { addresses: [] };

    const data = await client.query<any, any>('GetAddressSeenQuery', payload);
    res.status(200).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'internal' });
  }
});

// Generic model snapshot (useful for debugging specific height)
app.get('/model', async (req, res) => {
  try {
    const modelId = String(req.query.modelId || '').trim();
    if (!modelId) return res.status(400).json({ error: 'modelId is required' });
    const bhParam = req.query.blockHeight;
    const filter: any = {};
    if (bhParam !== undefined && bhParam !== null && String(bhParam).length) {
      const n = Number(bhParam);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'blockHeight must be a non-negative number' });
      filter.blockHeight = n;
    }
    const data = await client.query<any, any>('GetModelsQuery', {
      modelIds: [modelId],
      ...(Object.keys(filter).length ? { filter } : {}),
    });
    res.status(200).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'internal' });
  }
});

// Event log pagination for a given model
app.get('/events', async (req, res) => {
  try {
    const modelId = String(req.query.modelId || '').trim();
    if (!modelId) return res.status(400).json({ error: 'modelId is required' });

    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
    const paging: any = {};
    if (limit !== undefined) {
      if (!Number.isFinite(limit) || limit <= 0) return res.status(400).json({ error: 'limit must be a positive number' });
      paging.limit = limit;
    }
    if (offset !== undefined) {
      if (!Number.isFinite(offset) || offset < 0) return res.status(400).json({ error: 'offset must be a non-negative number' });
      paging.offset = offset;
    }

    const data = await client.query<any, any>('FetchEventsQuery', {
      modelIds: [modelId],
      filter: {},
      ...(Object.keys(paging).length ? { paging } : {}),
    });
    res.status(200).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'internal' });
  }
});

const PORT = Number(3000);
const server = app.listen(PORT, () => {
  console.log('\n🚀 Bitcoin Advanced Wallet Watcher started!\n');
  console.log('curl "http://localhost:' + PORT + '/health"');
  console.log('curl "http://localhost:' + PORT + '/tx-status?txids=aaaaaaaa...,bbbbbbbb..."');
  console.log('curl "http://localhost:' + PORT + '/address-seen?addresses=bc1qexampleaddr1...,bc1qexampleaddr2..."');
  console.log('curl "http://localhost:' + PORT + '/model?modelId=my-model-name&blockHeight=100"');
  console.log('curl "http://localhost:' + PORT + '/events?modelId=my-model-name&limit=10&offset=0"');
  console.log('\n═══════════════════════════════════════════════════════════════\n');
});

// graceful shutdown
const shutdown = async (code = 0) => {
  try { await new Promise<void>(r => server.close(() => r())); } catch {}
  try { if (child.connected) child.disconnect(); } catch {}
  try { child.kill('SIGTERM'); } catch {}
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (e) => { console.error(e); shutdown(1); });
process.on('unhandledRejection', (e) => { console.error(e); shutdown(1); });
