import { Injectable } from '@nestjs/common';
import { QueryBus } from '@easylayer/common/cqrs';
import { GetModelsQuery, FetchEventsQuery } from '@easylayer/bitcoin';

@Injectable()
export class CqrsFactoryService {
  constructor(private readonly queryBus: QueryBus) {}

  public async executeQuery(constructorName: string, dto: any) {
    let queryInstance;

    switch (constructorName) {
      case 'GetModelsQuery':
        queryInstance = new GetModelsQuery(dto);
        break;
      case 'FetchEventsQuery':
        queryInstance = new FetchEventsQuery(dto);
        break;
      default:
        throw new Error(`Unknown query: ${constructorName}`);
    }

    return await this.queryBus.execute(queryInstance);

    // const query: IQuery = { ...dto, constructor: { name: constructorName } };
    // return this.queryBus.execute(Object.assign(Object.create(query)));
  }
}
