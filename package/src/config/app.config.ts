import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

@Injectable()
export class AppConfig {
  @Transform(({ value }) => (value?.length ? value : 'development'))
  @IsString()
  @JSONSchema({ description: 'Node environment', default: 'development' })
  NODE_ENV: string = 'development';

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : undefined))
  @IsIn(['trace', 'debug', 'info', 'warn', 'error', 'fatal'], {
    message: 'LOG_LEVEL must be one of: trace, debug, info, warn, error, fatal',
  })
  @JSONSchema({
    description: 'Minimum log level to output. Ignored if DEBUG=1. Defaults to "info" when not set.',
    examples: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
  })
  LOG_LEVEL?: LogLevel;

  @IsOptional()
  @IsString()
  @JSONSchema({
    description: 'If set, structured logs (NDJSON) are appended to this file. When unset, logs go to stdout.',
    example: '/var/log/app.log',
  })
  LOGS_FILE?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '1' ? '1' : undefined))
  @IsString()
  @JSONSchema({
    description: 'When set to "1", forces debug-level logging regardless of LOG_LEVEL (except in test).',
    example: '1',
  })
  DEBUG?: '1';

  isPRODUCTION(): boolean {
    return this.NODE_ENV === 'production';
  }

  isDEVELOPMENT(): boolean {
    return this.NODE_ENV === 'development';
  }

  isTEST(): boolean {
    return this.NODE_ENV === 'test';
  }

  isDEBUG(): boolean {
    return this.DEBUG === '1';
  }
}
