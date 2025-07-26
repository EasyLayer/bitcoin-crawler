import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsBoolean, IsOptional, IsNumber } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

type DatabaseTypes = 'sqlite' | 'postgres';

@Injectable()
export class EventStoreConfig {
  @IsString()
  @JSONSchema({
    description:
      'For SQLite: folder path where the database file will be created; ' +
      'For Postgres: name of the database to connect to.',
    default: `resolve(process.cwd(), 'eventstore`,
  })
  @Transform(({ value }) =>
    typeof value === 'string' && value.length ? value : resolve(process.cwd(), 'eventstore/bitcoin.db')
  )
  EVENTSTORE_DB_NAME: string = resolve(process.cwd(), 'eventstore/bitcoin.db');

  @Transform(({ value }) => (value?.length ? value : 'sqlite'))
  @IsString()
  @JSONSchema({
    description: 'Type of database for the eventstore.',
    default: 'sqlite',
    enum: ['sqlite', 'postgres'],
  })
  EVENTSTORE_DB_TYPE: DatabaseTypes = 'sqlite';

  // @Transform(({ value }) => (value?.length ? value : 'sqlite'))

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
    return n === 0 ? 0 : n || 1000;
  })
  @IsNumber()
  EVENTSTORE_SNAPSHOT_INTERVAL: number = 1000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 999;
  })
  @IsNumber()
  EVENTSTORE_INSERT_BATCH_SIZE: number = 999;

  isLogging(): boolean {
    return process?.env?.DB_DEBUG === '1';
  }
}
