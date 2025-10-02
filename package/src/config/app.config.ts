import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class AppConfig {
  @Transform(({ value }) => (value?.length ? value : 'development'))
  @IsString()
  @JSONSchema({ description: 'Node environment', default: 'development' })
  NODE_ENV: string = 'development';

  isPRODUCTION(): boolean {
    return process?.env?.NODE_ENV === 'production';
  }

  isDEVELOPMENT(): boolean {
    return process?.env?.NODE_ENV === 'development';
  }

  isDEBUG(): boolean {
    return process?.env?.DEBUG === '1';
  }
}
