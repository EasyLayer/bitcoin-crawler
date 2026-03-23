import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsBoolean, IsOptional, IsNumber } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import { getUnifiedEnv } from './unified-env';

type DatabaseTypes = 'sqlite' | 'postgres' | 'sqlite-opfs';

const isNodeLike = typeof window === 'undefined';

function defaultDbName(dbType?: any, incoming?: string): string {
  if (incoming && incoming.length) return incoming;

  if (!isNodeLike || dbType === 'sqlite-opfs') return 'bitcoin.sqlite3';

  // Node/Electron:
  if (dbType === 'sqlite' || !dbType) {
    return `${process.cwd()}/eventstore/bitcoin.db`;
  }
  if (dbType === 'postgres') {
    return 'bitcoin';
  }
  return 'bitcoin';
}

@Injectable()
export class EventStoreConfig {
  @IsString()
  @JSONSchema({
    description:
      'For SQLite: folder path where the database file will be created; ' +
      'For Postgres: name of the database to connect to.',
    default: `resolve(process.cwd(), eventstore`,
  })
  EVENTSTORE_DB_NAME: string = defaultDbName(getUnifiedEnv().EVENTSTORE_DB_TYPE, getUnifiedEnv().EVENTSTORE_DB_NAME);

  @IsString()
  @JSONSchema({
    description: 'Type of database for the eventstore.',
    default: 'sqlite',
    enum: ['sqlite', 'postgres', 'sqlite-opfs'],
  })
  @Transform(({ value }) => (value?.length ? value : isNodeLike ? 'sqlite' : 'sqlite-opfs'))
  EVENTSTORE_DB_TYPE: DatabaseTypes = isNodeLike ? 'sqlite' : 'sqlite-opfs';

  @IsBoolean()
  @JSONSchema({
    description: 'Automatic synchronization that creates or updates tables and columns. Use with caution.',
    default: true,
  })
  EVENTSTORE_DB_SYNCHRONIZE: boolean = true;

  @Transform(({ value }) => (value?.length ? value : 'localhost'))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: 'Host for the eventstore database connection.',
  })
  EVENTSTORE_DB_HOST?: string;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 5432;
  })
  @IsNumber()
  @IsOptional()
  @JSONSchema({
    description: 'Port for the eventstore database connection.',
  })
  EVENTSTORE_DB_PORT?: number;

  @Transform(({ value }) => (value?.length ? value : ''))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: 'Username for the eventstore database connection.',
  })
  EVENTSTORE_DB_USERNAME?: string;

  @Transform(({ value }) => (value?.length ? value : ''))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: 'Password for the eventstore database connection.',
  })
  EVENTSTORE_DB_PASSWORD?: string;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 10000;
  })
  @IsNumber()
  EVENTSTORE_SNAPSHOT_INTERVAL: number = 10000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 999;
  })
  @IsNumber()
  EVENTSTORE_INSERT_BATCH_SIZE: number = 999;

  @Transform(({ value }) => {
    if (!value || !value.length) return undefined;
    const n = parseInt(value, 10);
    return isNaN(n) ? undefined : n;
  })
  @IsNumber()
  @IsOptional()
  EVENTSTORE_PG_POOL_MAX?: number;

  @Transform(({ value }) => {
    if (!value || !value.length) return undefined;
    const n = parseInt(value, 10);
    return isNaN(n) ? undefined : n;
  })
  @IsNumber()
  @IsOptional()
  EVENTSTORE_PG_POOL_MIN?: number;

  @Transform(({ value }) => {
    if (!value || !value.length) return undefined;
    const n = parseInt(value, 10);
    return isNaN(n) ? undefined : n;
  })
  @IsNumber()
  @IsOptional()
  EVENTSTORE_PG_IDLE_TIMEOUT?: number;

  @Transform(({ value }) => {
    if (!value || !value.length) return undefined;
    const n = parseInt(value, 10);
    return isNaN(n) ? undefined : n;
  })
  @IsNumber()
  @IsOptional()
  EVENTSTORE_PG_CONNECTION_TIMEOUT?: number;

  @Transform(({ value }) => {
    if (!value || !value.length) return undefined;
    const n = parseInt(value, 10);
    return isNaN(n) ? undefined : n;
  })
  @IsNumber()
  @IsOptional()
  EVENTSTORE_PG_QUERY_TIMEOUT?: number;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description:
      'Base URL for @sqlite.org/sqlite-wasm browser runtime files. ' +
      'Only used in browser (sqlite-opfs) mode. ' +
      'The directory must contain index.mjs, sqlite3.wasm, and required worker runtime files such as sqlite3-worker1.mjs.',
    examples: [
      '/sqlite',
      'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.51.2-build8/dist',
      'https://your-app.example.com/assets/sqlite',
    ],
  })
  EVENTSTORE_SQLITE_RUNTIME_BASE_URL?: string;

  isLogging(): boolean {
    // Safe for both Node and browser
    return getUnifiedEnv().DB_DEBUG === '1';
  }
}
