import { GetNetworkStatsQueryHandler } from './get-network-stats.query-handler';
import { GetNetworkBlockQueryHandler } from './get-network-block.query-handler';
import { GetNetworkBlocksQueryHandler } from './get-network-blocks.query-handler';
import { GetNetworkLastBlockQueryHandler } from './get-network-last-block.query-handler';

export default [
  GetNetworkStatsQueryHandler,
  GetNetworkBlockQueryHandler,
  GetNetworkBlocksQueryHandler,
  GetNetworkLastBlockQueryHandler,
];
