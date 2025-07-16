import { Client } from '@easylayer/transport-sdk';

// Configuration from environment variables
const WS_PORT = process.env.WS_PORT || '3001';
const WS_PATH = process.env.WS_PATH || '/';

async function main() {
  console.log('🚀 Starting Bitcoin Address Watchlist WebSocket Client\n');

  const wsClient = new Client({
    transport: {
      type: 'ws',
      url: `http://localhost:${WS_PORT}`,
      path: WS_PATH,
      timeout: 10000
    }
  });

  try {
    // Subscribe to multiple events
    const unsubscribe1 = wsClient.subscribe('WatchedAddressActivityEvent', async (event) => {
      console.log('📢 WatchedAddressActivityEvent:', JSON.stringify(event, null, 2));
    });

    const unsubscribe2 = wsClient.subscribe('BitcoinNetworkBlocksAddedEvent', async (event) => {
      console.log('📢 BitcoinNetworkBlocksAddedEvent:', JSON.stringify(event, null, 2));
    });

    const unsubscribe3 = wsClient.subscribe('BitcoinNetworkReorganizedEvent', async (event) => {
      console.log('📢 BitcoinNetworkReorganizedEvent:', JSON.stringify(event, null, 2));
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🔄 Shutting down client...');
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      await wsClient.destroy();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ WebSocket client error:', error);
    await wsClient.destroy();
    process.exit(1);
  }
}

main().catch(console.error);