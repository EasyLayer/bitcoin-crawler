import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import { Client } from '@easylayer/transport-sdk';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import type { BlockAddedEvent } from './blocks.model';
import { mockBlocks, networkTableSQL, balanceTableSQL } from './mocks';

// Set timeout for all tests in this file
jest.setTimeout(60000); // 1 minute

describe('/Bitcoin Crawler: IPC Subscription Checks', () => {
  let dbService!: SQLiteService;
  let child: ChildProcess;
  let client: Client;

  // Deferred for receiving N events
  let eventsDeferred: { promise: Promise<void>; resolve: () => void };
  const expectedEventCount = 3;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    // jest.useRealTimers();
    jest.useFakeTimers({ advanceTimers: true });

    // Deferred factory
    const makeDeferred = () => {
      let resolveFn!: () => void;
      const promise = new Promise<void>((res) => {
        resolveFn = res;
      });
      return { promise, resolve: resolveFn };
    };
    eventsDeferred = makeDeferred();

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/events-subscribe/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    // Initialize single DB connection for projections
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/view.db') });
    await dbService.connect();

    // Create projection tables
    await dbService.exec(networkTableSQL);
    await dbService.exec(balanceTableSQL);

    const appPath = resolve(process.cwd(), 'src/events-subscribe/app.ts');
    const mockPath = resolve(process.cwd(), 'src/events-subscribe/app-mocks.ts');

    child = fork(appPath, [], {
      execArgv: ['-r', 'ts-node/register', '-r', mockPath],
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        BITCOIN_CRAWLER_TESTING: 'true',
        BITCOIN_CRAWLER_APPLICATION_NAME: 'bitcoin',
        DB_DEBUG: '1',
        LOG_LEVEL: 'debug',
      },
    });

    // Create a client with IPC transport
    client = new Client({
      transport: {
        type: 'ipc',
        child,
      },
    });

    let receivedEventCount = 0;

    // Subscribe to events and persist into projection tables.
    // IMPORTANT: At application startup, events arrive from the child process so quickly
    // that the child sends them before the connection is fully established.
    // Because we immediately throw an error in that case, the first event is rejected.
    // On the next attempt, two events arrive at once, so everything works correctly
    // but it's important to keep this behavior in mind.
    client.subscribe('BlockAddedEvent', async ({ payload }: BlockAddedEvent) => {
      const p = JSON.stringify(payload.block).replace(/'/g, "''");

      await dbService.exec(`
        INSERT INTO balance (requestId, type, payload, blockHeight)
        VALUES (
          '${payload.requestId}',
          'BlockAddedEvent',
          json('${p}'),
          ${payload.blockHeight}
        );
      `);

      receivedEventCount++;
      if (receivedEventCount >= expectedEventCount) {
        eventsDeferred.resolve();
      }
    });

    jest.runAllTimers();

    // await Promise.resolve();
    // await new Promise<void>((r) => setImmediate(r));

    // Wait until expected number of events handled
    await eventsDeferred.promise;

    // Close the write database connection after inserting events
    await dbService.close();

    // Gracefully terminate child process
    child.kill('SIGTERM');

    // Wait for child process to exit
    await new Promise<void>((resolve) => {
      child.on('exit', () => {
        resolve();
      });
    });

    // Run any remaining timers
    jest.runAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();

    if (dbService) {
      // eslint-disable-next-line no-console
      await dbService.close().catch(console.error);
    }
  });

  it('should store at least 3 BlockAddedEvent entries in balance table', async () => {
    // Re-open DB for assertions
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/view.db') });
    await dbService.connect();

    const rows = await dbService.all(`SELECT * FROM balance;`);
    expect(rows).toHaveLength(mockBlocks.length);

    rows.forEach((row, idx) => {
      const block = JSON.parse(row.payload);
      // Compare with mockBlocks data
      const expectedBlock = mockBlocks[idx];
      expect(block.hash).toBe(expectedBlock!.hash);
      expect(block.height).toBe(expectedBlock!.height);
    });
  });
});
