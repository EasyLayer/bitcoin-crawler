import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BaseWalletWatcher } from './model';
import {
  GetBalanceQueryHandler,
  GetUnspentQueryHandler,
  GetTxidsQueryHandler,
} from './queries';

bootstrap({
  Models: [BaseWalletWatcher],
  QueryHandlers: [
    GetBalanceQueryHandler,
    GetUnspentQueryHandler,
    GetTxidsQueryHandler,
  ],
})
  .then(() => {
    console.log('\n🚀 Bitcoin Base Wallet Watcher Started!\n');
    console.log('🔧 Default Framework Queries:\n');

    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"name":"GetModelsQuery","dto":{"modelIds":["my-model-name"],"filter":{"blockHeight":100}}}}\'\n');

    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"name":"FetchEventsQuery","dto":{"modelIds":["my-model-name"],"filter":{},"paging":{"limit":10}}}}\'\n');

    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"name":"GetBalanceQuery","dto":{"addresses":["bc1qexampleaddr1...","bc1qexampleaddr2..."]}}}\'\n');

    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"name":"GetUnspentQuery","dto":{"addresses":["bc1qexampleaddr1...","bc1qexampleaddr2..."]}}}\'\n');

    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"name":"GetTxidsQuery","dto":{"addresses":["bc1qexampleaddr1...","bc1qexampleaddr2..."]}}}\'\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  })
  .catch((error: Error) => {
    console.error('❌ Failed to start Bitcoin Base Wallet Watcher:', error);
  });
