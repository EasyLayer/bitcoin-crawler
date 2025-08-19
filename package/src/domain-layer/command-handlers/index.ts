import { AddBlocksBatchCommandHandler } from './add-blocks-batch.command-handler';
import { InitNetworkCommandHandler } from './init-network.command-handler';
import { InitMempoolCommandHandler } from './init-mempool.command-handler';
import { ProcessMempoolBlocksBatchCommandHandler } from './process-mempool-blocks-batch.command-handler';
import { ProcessMempoolSyncCommandHandler } from './process-mempool-sync.command-handler';

export const CommandHandlers = [
  AddBlocksBatchCommandHandler,
  InitNetworkCommandHandler,
  InitMempoolCommandHandler,
  ProcessMempoolBlocksBatchCommandHandler,
  ProcessMempoolSyncCommandHandler,
];
