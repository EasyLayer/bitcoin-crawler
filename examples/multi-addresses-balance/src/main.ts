import { bootstrap } from '@easylayer/bitcoin-crawler';
import Model from './model';
import {
  GetPortfolioBalanceQueryHandler
} from './query';

bootstrap({
  Models: [Model],
  QueryHandlers: [GetPortfolioBalanceQueryHandler]
})
  .then(() => {
    console.log('\n🚀 Multi Addresses Balance API Started!\n');    
    console.log('🔧 Default Framework Queries:');
    console.log(' • GetModelsQuery - Get model state/snapshot by blockHeight');
    console.log(' • FetchEventsQuery - Get events history with filtering\n');

    console.log('💡 Example with curl:');

    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"GetModelsQuery","dto":{"modelIds":["top-addresses-by-balance"],"filter":{"blockHeight":100}}}}\'\n');

    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"FetchEventsQuery","dto":{"modelIds":["top-addresses-by-balance"],"filter":{},"paging":{"limit":10}}}}\'\n');

    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"GetPortfolioBalanceQueryHandler","dto":{}}}\'\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  })
  .catch((error: Error) => {
    console.error('❌ Failed to start Multi Addresses Balance API:', error);
  });