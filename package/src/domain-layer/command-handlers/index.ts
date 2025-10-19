import { AddBlocksBatchCommandHandler } from './add-blocks-batch.command-handler';
import { InitNetworkCommandHandler } from './init-network.command-handler';
import { InitMempoolCommandHandler } from './init-mempool.command-handler';
import { SyncMempoolCommandHandler } from './sync-mempool.command-handler';
import { RefreshMempoolCommandHandler } from './refresh-mempool.command-handler';

export const CommandHandlers = [
  AddBlocksBatchCommandHandler,
  InitNetworkCommandHandler,
  InitMempoolCommandHandler,
  SyncMempoolCommandHandler,
  RefreshMempoolCommandHandler,
];
