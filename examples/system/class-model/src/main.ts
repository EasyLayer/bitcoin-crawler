import { bootstrap } from '@easylayer/bitcoin-crawler';
import { AddressUtxoWatcher } from './model';
import {
  GetBalanceQueryHandler
} from './query';

bootstrap({
  Models: [AddressUtxoWatcher],
  QueryHandlers: [GetBalanceQueryHandler]
})
  .then(() => {
    console.log('\n🚀 Bitcoin Address UTXOx Watcher Started!\n');    
    console.log('🔧 Default Framework Queries:');

    console.log('💡 Example with curl:');

    console.log('curl -X POST http://localhost:3000/query \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"name":"GetModelsQuery","dto":{"modelIds":["my-model-name"],"filter":{"blockHeight":100}}}\'\n');

    console.log('curl -X POST http://localhost:3000/query \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"name":"FetchEventsQuery","dto":{"modelIds":["my-model-name"],"filter":{},"paging":{"limit":10}}}\'\n');

    console.log('curl -X POST http://localhost:3000/query \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"name":"GetBalanceQuery","dto":{"addresses":["bc1qexampleaddr1...","bc1qexampleaddr2..."]}}}\'\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  })
  .catch((error: Error) => {
    console.error('❌ Failed to start Bitcoin Address UTXOx Watcher:', error);
  });