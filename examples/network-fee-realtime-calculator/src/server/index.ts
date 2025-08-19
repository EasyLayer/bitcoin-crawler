import { bootstrap } from '@easylayer/bitcoin-crawler';
import Model from './model';

bootstrap({
  Models: [Model]
})
  .then(() => {
    console.log('\n🚀 Bitcoin Address Watchlist API Started!\n');
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
    console.log('       "modelIds": ["address-watchlist-aggregate"],');
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
    console.log('       "modelIds": ["address-watchlist-aggregate"],');
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

    console.log('👁️ Custom Watchlist Queries:\n');
    
    console.log('1️⃣ GetWatchlistQuery - Get all watched addresses');
    console.log(' POST /');
    console.log(' {');
    console.log('   "action": "query",');
    console.log('   "payload": {');
    console.log('     "constructorName": "GetWatchlistQuery",');
    console.log('     "dto": {');
    console.log('       "modelId": "address-watchlist-aggregate",');
    console.log('       "includeInactive": false,');
    console.log('       "blockHeight": 850000');
    console.log('     }');
    console.log('   }');
    console.log(' }\n');

    console.log('2️⃣ GetWatchedAddressQuery - Get specific address details');
    console.log(' POST /');
    console.log(' {');
    console.log('   "action": "query",');
    console.log('   "payload": {');
    console.log('     "constructorName": "GetWatchedAddressQuery",');
    console.log('     "dto": {');
    console.log('       "modelId": "address-watchlist-aggregate",');
    console.log('       "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",');
    console.log('       "blockHeight": 850000');
    console.log('     }');
    console.log('   }');
    console.log(' }\n');

    console.log('3️⃣ GetWatchedAddressHistoryQuery - Get address UTXO history');
    console.log(' POST /');
    console.log(' {');
    console.log('   "action": "query",');
    console.log('   "payload": {');
    console.log('     "constructorName": "GetWatchedAddressHistoryQuery",');
    console.log('     "dto": {');
    console.log('       "modelId": "address-watchlist-aggregate",');
    console.log('       "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",');
    console.log('       "blockHeight": 850000');
    console.log('     }');
    console.log('   }');
    console.log(' }\n');

    console.log('4️⃣ GetWatchlistStatsQuery - Get overall watchlist statistics');
    console.log(' POST /');
    console.log(' {');
    console.log('   "action": "query",');
    console.log('   "payload": {');
    console.log('     "constructorName": "GetWatchlistStatsQuery",');
    console.log('     "dto": {');
    console.log('       "modelId": "address-watchlist-aggregate",');
    console.log('       "blockHeight": 850000');
    console.log('     }');
    console.log('   }');
    console.log(' }\n');

    console.log('5️⃣ GetActiveAddressesQuery - Get active addresses with filtering');
    console.log(' POST /');
    console.log(' {');
    console.log('   "action": "query",');
    console.log('   "payload": {');
    console.log('     "constructorName": "GetActiveAddressesQuery",');
    console.log('     "dto": {');
    console.log('       "modelId": "address-watchlist-aggregate",');
    console.log('       "minBalance": "100000000",');
    console.log('       "sortBy": "balance",');
    console.log('       "limit": 50,');
    console.log('       "blockHeight": 850000');
    console.log('     }');
    console.log('   }');
    console.log(' }\n');

    console.log('💡 Example with curl - Get watchlist:');
    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"GetWatchlistQuery","dto":{"modelId":"address-watchlist-aggregate","includeInactive":false}}}\'\n');

    console.log('💡 Example with curl - Get address details:');
    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"GetWatchedAddressQuery","dto":{"modelId":"address-watchlist-aggregate","address":"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"}}}\'\n');

    console.log('💡 Example with curl - Get active addresses with min 1 BTC:');
    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"GetActiveAddressesQuery","dto":{"modelId":"address-watchlist-aggregate","minBalance":"100000000","sortBy":"balance","limit":10}}}\'\n');

    console.log('💡 Example with curl - Get watchlist stats:');
    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"GetWatchlistStatsQuery","dto":{"modelId":"address-watchlist-aggregate"}}}\'\n');

    console.log('💡 Example with curl - Get model snapshot:');
    console.log('curl -X POST http://localhost:3000/ \\');
    console.log(' -H "Content-Type: application/json" \\');
    console.log(' -d \'{"action":"query","payload":{"constructorName":"GetModelsQuery","dto":{"modelIds":["address-watchlist-aggregate"],"filter":{"blockHeight":850000}}}}\'\n');

    console.log('📝 Note: To add/remove addresses from watchlist, you need to implement command handlers.');
    console.log('   Commands are not shown here but would include:');
    console.log('   • AddAddressesToWatchlistCommand');
    console.log('   • RemoveAddressesFromWatchlistCommand');
    console.log('   • UpdateWatchlistConfigCommand\n');

    console.log('✅ Ready to monitor specific Bitcoin addresses in real-time!');
    console.log('📈 Efficient memory usage: Only tracks your selected addresses');
    console.log('🎯 Perfect for: Exchange hot wallets, whale watching, compliance monitoring');
    console.log('═══════════════════════════════════════════════════════════════\n');
  })
  .catch((error: Error) => {
    console.error('❌ Failed to start Bitcoin Address Watchlist API:', error);
  });