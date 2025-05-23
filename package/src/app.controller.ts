import {
  Controller,
  HttpCode,
  Header,
  UsePipes,
  ValidationPipe,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { QueryDto } from './application-layer/dtos';
import { CqrsFactoryService } from './application-layer/services';

export interface RpcRequest<P = any> {
  requestId: string;
  action: 'query';
  payload: P;
}

export interface RpcPayload<DTO = any> {
  constructorName: string;
  dto: DTO;
}

export interface RpcResponse<R = any> {
  requestId: string;
  action: 'queryResponse' | 'error';
  payload: R;
}

@Controller()
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AppController {
  constructor(private readonly cqrsFactoryService: CqrsFactoryService) {}

  @Post()
  @HttpCode(200)
  @Header('Content-Type', 'application/json')
  async handleCommands(@Body() request: RpcRequest<RpcPayload<any>>): Promise<RpcResponse<any>> {
    const { requestId, action, payload } = request;

    try {
      // Query
      if (action === 'query') {
        if (!payload) {
          throw new Error('Missing payload for query');
        }

        const { dto, constructorName } = payload;

        const queryDto = plainToInstance(QueryDto, dto);
        const errors = validateSync(queryDto, {
          whitelist: true,
          // forbidNonWhitelisted: true,
        });

        if (errors.length > 0) {
          const msgs = errors.flatMap((e) => Object.values(e.constraints || {})).join('; ');
          throw new BadRequestException(msgs);
        }

        const result = await this.cqrsFactoryService.executeQuery(constructorName, dto);
        return { requestId, action: 'queryResponse', payload: result };
      }

      throw new Error(`Unsupported action: ${action}`);
    } catch (err: any) {
      return {
        requestId,
        action: 'error',
        payload: err.message ?? String(err),
      };
    }
  }
}
