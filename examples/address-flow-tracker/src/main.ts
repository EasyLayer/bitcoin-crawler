import { bootstrap } from '@easylayer/bitcoin-crawler';
import Model from './model';
import {
  GetTopRiskFlowsQueryHandler
} from './query';

bootstrap({
  Models: [Model],
  QueryHandlers: [GetTopRiskFlowsQueryHandler]
})
  .then(() => {
    console.log('\n🚀 Address Flow Tracker!\n');    
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
    console.log(' -d \'{"action":"query","payload":{"constructorName":"GetTopRiskFlowsQuery","dto":{"limit":10}}}\'\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  })
  .catch((error: Error) => {
    console.error('❌ Failed to start Address Flow Tracker API:', error);
  });