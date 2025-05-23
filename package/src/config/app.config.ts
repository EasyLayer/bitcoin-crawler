import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber, Min, Max, IsOptional } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class AppConfig {
  @Transform(({ value }) => (value?.length ? value : 'development'))
  @IsString()
  @JSONSchema({ description: 'Node environment', default: 'development' })
  NODE_ENV: string = 'development';

  @Transform(({ value }) => (value?.length ? value : '0.0.0.0'))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Http Server host' })
  HTTP_HOST: string = '0.0.0.0';

  @Transform(({ value }) => parseInt(value, 10) || 3000)
  @IsNumber()
  @Min(0)
  @Max(65535)
  @JSONSchema({ description: 'Http Server port', default: 3000, minimum: 0, maximum: 65535 })
  HTTP_PORT: number = 3000;

  @Transform(({ value }) => (value?.length ? value : '127.0.0.1'))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Tcp Server host' })
  TCP_HOST: string = '127.0.0.1';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 4000;
  })
  @IsNumber()
  @Min(0)
  @Max(65535)
  @JSONSchema({ description: 'Tcp Server port', default: 4000, minimum: 0, maximum: 65535 })
  TCP_PORT: number = 4000;

  isPRODUCTION(): boolean {
    return process?.env?.NODE_ENV === 'production';
  }

  isDEVELOPMENT(): boolean {
    return process?.env?.NODE_ENV === 'development';
  }

  isDEBUG(): boolean {
    return process?.env?.DEBUG === '1';
  }

  isTEST(): boolean {
    return process?.env?.NODE_ENV === 'test';
  }
}
