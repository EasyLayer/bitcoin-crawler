import { resolve } from 'node:path';
import { config } from 'dotenv';
import request from 'supertest';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlockModel, { AGGREGATE_ID } from './blocks.model';
import type { NetworkEventStoreRecord, BlocksEventStoreRecord } from './mocks';
import { networkTableSQL, blocksTableSQL, mockNetworks, mockBlockModel, mockBlocks } from './mocks';

// IMPORTANT: We set BITCOIN_CRAWLER_MAX_BLOCK_HEIGHT=2 and add blocks up to this height to the database
// so that the application will spin but not get new blocks.

describe('/Bitcoin Crawler: HTTP Transport Checks(supertest)', () => {
  let dbService!: SQLiteService;
  let app: INestApplication | INestApplicationContext;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/http-checks(supertest)/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    // Initialize the write database
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/data.db') });
    await dbService.connect();

    await dbService.exec(networkTableSQL);

    for (const rec of mockNetworks as NetworkEventStoreRecord[]) {
      const payloadSql = JSON.stringify(rec.payload).replace(/'/g, "''");
      const values = [
        rec.version,
        `'${rec.requestId}'`,
        `'${rec.status}'`,
        `'${rec.type}'`,
        `json('${payloadSql}')`,
        rec.blockHeight,
      ].join(', ');
      await dbService.exec(`
        INSERT INTO network
          (version, requestId, status, type, payload, blockHeight)
        VALUES
          (${values});
      `);
    }

    await dbService.exec(blocksTableSQL);

    for (const rec of mockBlockModel as BlocksEventStoreRecord[]) {
      const payloadSql = JSON.stringify(rec.payload).replace(/'/g, "''");
      const values = [
        rec.version,
        `'${rec.requestId}'`,
        `'${rec.status}'`,
        `'${rec.type}'`,
        `json('${payloadSql}')`,
        rec.blockHeight,
      ].join(', ');
      await dbService.exec(`
        INSERT INTO ${AGGREGATE_ID}
          (version, requestId, status, type, payload, blockHeight)
        VALUES
          (${values});
      `);
    }

    // Close the write database connection after inserting events
    await dbService.close();

    const appContext = await bootstrap({
      Models: [BlockModel],
      rpc: true,
    });

    if (appContext) {
      app = appContext;
    }

    jest.runAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();
    if (dbService) {
      // eslint-disable-next-line no-console
      await dbService.close().catch(console.error);
    }
    // eslint-disable-next-line no-console
    await app?.close().catch(console.error);
  });

  it(`should return the full Network model at the latest block height`, async () => {
    const requestId = 'test-1';
    const res = await request(`http://${process.env.HTTP_HOST}:${process.env.HTTP_PORT}`)
      .post('')
      .send({
        requestId,
        action: 'query',
        payload: {
          constructorName: 'GetModelsQuery',
          dto: { modelIds: ['network'] },
        },
      })
      .expect(200)
      .expect('Content-Type', /json/);

    const { body } = res;

    expect(body).toMatchObject({
      requestId,
      action: 'queryResponse',
    });

    const model = body.payload;
    expect(model.aggregateId).toBe('network');
    expect(model.version).toBe(3);
    expect(model.blockHeight).toBe(2);
    expect(model.payload).toBeDefined();
    const payload = JSON.parse(model.payload);

    expect(payload.__type).toBeDefined();
    expect(payload.__type).toBe('Network');
    expect(payload.chain).toBeDefined();
    expect(Array.isArray(payload.chain)).toBe(true);
    expect(payload.chain.length).toBe(3);
  });

  it('should return the Network model from cache', async () => {
    const requestId = 'test-2';
    const res = await request(`http://${process.env.HTTP_HOST}:${process.env.HTTP_PORT}`)
      .post('')
      .send({
        requestId,
        action: 'query',
        payload: {
          constructorName: 'GetModelsQuery',
          dto: { modelIds: ['network'], blockHeight: 2 },
        },
      })
      .expect(200)
      .expect('Content-Type', /json/);

    const { body } = res;
    expect(body).toMatchObject({ requestId, action: 'queryResponse' });

    const model = body.payload;
    expect(model.aggregateId).toBe('network');
    expect(model.version).toBe(3);
    expect(model.blockHeight).toBe(2);
    expect(typeof model.payload).toBe('string');
    const payload = JSON.parse(model.payload);

    expect(payload.__type).toBe('Network');
    expect(Array.isArray(payload.chain)).toBe(true);
    expect(payload.chain.length).toBe(3);
  });

  it('should return all events for Network model', async () => {
    const requestId = 'test-3';
    const res = await request(`http://${process.env.HTTP_HOST}:${process.env.HTTP_PORT}`)
      .post('')
      .send({
        requestId,
        action: 'query',
        payload: {
          constructorName: 'FetchEventsQuery',
          dto: { modelIds: ['network'] },
        },
      })
      .expect(200)
      .expect('Content-Type', /json/);

    const { body } = res;
    expect(body).toMatchObject({ requestId, action: 'queryResponse' });

    const events = body.payload;
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(3);

    // 1st event
    expect(events[0].payload).toMatchObject({
      aggregateId: 'network',
      requestId: 'req-1',
      blockHeight: 0,
    });
    expect(events[0].constructor.name).toBe('BitcoinNetworkInitializedEvent');

    // 2nd event
    expect(events[1].payload).toMatchObject({
      aggregateId: 'network',
      requestId: 'req-2',
      blockHeight: 2,
      blocks: expect.any(Array),
    });
    expect(events[1].constructor.name).toBe('BitcoinNetworkBlocksAddedEvent');
    expect(events[1].payload.blocks.length).toBeGreaterThan(0);

    // 3rd event (dynamic UUID)
    expect(events[2].payload).toMatchObject({
      aggregateId: 'network',
      blockHeight: 2,
    });
    expect(events[2].payload.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(events[2].constructor.name).toBe('BitcoinNetworkInitializedEvent');
  });

  it('should fetch Network model events with pagination', async () => {
    const requestId = 'test-4';
    const res = await request(`http://${process.env.HTTP_HOST}:${process.env.HTTP_PORT}`)
      .post('')
      .send({
        requestId,
        action: 'query',
        payload: {
          constructorName: 'FetchEventsQuery',
          dto: {
            modelIds: ['network'],
            paging: {
              limit: 2,
              offset: 1,
            },
          },
        },
      })
      .expect(200)
      .expect('Content-Type', /json/);

    const { body } = res;
    expect(body).toMatchObject({ requestId, action: 'queryResponse' });

    const events = body.payload;
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(2);

    expect(events[0].payload.requestId).toBe('req-2');
    expect(events[0].constructor.name).toBe('BitcoinNetworkBlocksAddedEvent');

    expect(events[1].payload.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(events[1].constructor.name).toBe('BitcoinNetworkInitializedEvent');
  });

  it('should return the full User model at latest block height', async () => {
    const requestId = 'test-5';
    const res = await request(`http://${process.env.HTTP_HOST}:${process.env.HTTP_PORT}`)
      .post('')
      .send({
        requestId,
        action: 'query',
        payload: {
          constructorName: 'GetModelsQuery',
          dto: { modelIds: [AGGREGATE_ID] },
        },
      })
      .expect(200)
      .expect('Content-Type', /json/);

    const { body } = res;
    expect(body).toMatchObject({ requestId, action: 'queryResponse' });

    const model = body.payload;
    expect(model.aggregateId).toBe(AGGREGATE_ID);
    expect(model.version).toBe(3);
    expect(model.blockHeight).toBe(2);
    expect(typeof model.payload).toBe('string');
    const payload = JSON.parse(model.payload);

    expect(payload.__type).toBe('BlocksModel');
    expect(Array.isArray(payload.blocks)).toBe(true);
    expect(payload.blocks.length).toBe(3);
  });

  it('should fetch User model events with pagination', async () => {
    const requestId = 'test-6';
    const res = await request(`http://${process.env.HTTP_HOST}:${process.env.HTTP_PORT}`)
      .post('')
      .send({
        requestId,
        action: 'query',
        payload: {
          constructorName: 'FetchEventsQuery',
          dto: {
            modelIds: [AGGREGATE_ID],
            paging: {
              limit: 2,
              offset: 1,
            },
          },
        },
      })
      .expect(200)
      .expect('Content-Type', /json/);

    const { body } = res;
    expect(body).toMatchObject({ requestId, action: 'queryResponse' });

    const events = body.payload;
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(2);

    expect(events[0].payload.requestId).toBe('req-2');
    expect(events[0].constructor.name).toBe('BlockAddedEvent');
  });
});
