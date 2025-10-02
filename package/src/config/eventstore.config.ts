import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsBoolean, IsOptional, IsNumber } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

type DatabaseTypes = 'sqlite' | 'postgres' | 'sqljs';

const isNodeLike = typeof window === 'undefined';

function defaultDbName(dbType?: any, incoming?: string): string {
  if (incoming && incoming.length) return incoming;

  // Browser/sql.js: Just a DB key (name) in IndexedDB
  if (!isNodeLike || dbType === 'sqljs') return 'bitcoin';

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
    default: `resolve(process.cwd(), 'eventstore`,
  })
  EVENTSTORE_DB_NAME: string = defaultDbName(process.env.EVENTSTORE_DB_TYPE, process.env.EVENTSTORE_DB_NAME);

  @IsString()
  @JSONSchema({
    description: 'Type of database for the eventstore.',
    default: 'sqlite',
    enum: ['sqlite', 'postgres', 'sqljs'],
  })
  @Transform(({ value }) => (value?.length ? value : isNodeLike ? 'sqlite' : 'sqljs'))
  EVENTSTORE_DB_TYPE: DatabaseTypes = isNodeLike ? 'sqlite' : 'sqljs';

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

  isLogging(): boolean {
    return process?.env?.DB_DEBUG === '1';
  }
}
