import { FetchEventsQueryHandler } from './fetch-events.query-handler';
import { GetModelsQueryHandler } from './get-models.query-handler';
import MempoolQueryHandlers from './mempool';
import NetworkQueryHandlers from './network';

export const QueryHandlers = [
  FetchEventsQueryHandler,
  GetModelsQueryHandler,
  ...MempoolQueryHandlers,
  ...NetworkQueryHandlers,
];
