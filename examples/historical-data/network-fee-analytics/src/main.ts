import { bootstrap } from '@easylayer/bitcoin-crawler';
import BitcoinFeeModel from './models';

bootstrap({
  Models: [BitcoinFeeModel],
})
  .then(() => {
    console.log('\n🚀 Bitcoin Fee Analytics API Started!\n');
    console.log('📋 Available Queries:\n');
    
    console.log('🔧 Default Framework Queries:');
    console.log(' • GetModelsQuery - Get model state/snapshot by blockHeight');
    console.log(' • FetchEventsQuery - Get events history with filtering\n');

    console.log('📊 GetModelsQuery - Get model snapshot at specific blockHeight');
    console.log(' POST /');
    console.log(' {');
    console.log('   "action": "query",');
    console.log('   "payload": {');
    console.log('     "constructorName": "GetModelsQuery",');
    console.log('     "dto": {');
    console.log('       "modelIds": ["bitcoin-fee-analytics"],');
    console.log('       "filter": {');
    console.log('         "blockHeight": 850000');
    console.log('       }');
    console.log('     }');
    console.log('   }');
    console.log(' }\n');

    console.log('📜 FetchEventsQuery - Get events history with filtering');
    console.log(' POST /');
    console.log(' {');
    console.log('   "action": "query",');
    console.log('   "payload": {');
    console.log('     "constructorName": "FetchEventsQuery",');
    console.log('     "dto": {');
    console.log('       "modelIds": ["bitcoin-fee-analytics"],');
    console.log('       "filter": {');
    console.log('         "blockHeight": 850000,');
    console.log('         "version": 100,');
    console.log('         "status": "PUBLISHED"');
    console.log('       },');
    console.log('       "paging": {');
    console.log('         "limit": 50,');
    console.log('         "offset": 0');
    console.log('       },');
    console.log('       "streaming": false');
    console.log('     }');
    console.log('   }');
    console.log(' }\n');

    console.log('💡 Example with curl - Get model snapshot:');
    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"GetModelsQuery","dto":{"modelIds":["bitcoin-fee-analytics"],"filter":{"blockHeight":850000}}}}\'\n');

    console.log('💡 Example with curl - Fetch events:');
    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"FetchEventsQuery","dto":{"modelIds":["bitcoin-fee-analytics"],"filter":{},"paging":{"limit":10}}}}\'\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  })
  .catch((error: Error) => {
    console.error('❌ Failed to start Bitcoin Fee Analytics:', error);
  });