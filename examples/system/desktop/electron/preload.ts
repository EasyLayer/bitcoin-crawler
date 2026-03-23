import { contextBridge, ipcRenderer } from 'electron';
import { Client } from '@easylayer/transport-sdk';

// Create the transport-sdk client once.
// It wires ipcRenderer.on('transport:message') immediately so it is ready
// before the renderer calls any method.
const client = new Client({
  transport: {
    type: 'electron-ipc-renderer',
    options: {
      // Pass ipcRenderer explicitly — the browser build of transport-sdk
      // cannot call require('electron') itself inside the sandbox.
      ipcRenderer,

      // Optional: uncomment if ElectronIpcMainService is configured with a password
      // pongPassword: 'secret',
    },
  },
});

// Expose a safe, typed API to the renderer via contextBridge.
// The renderer accesses this as window.crawlerAPI.
contextBridge.exposeInMainWorld('crawlerAPI', {
  /**
   * Check whether bootstrap() in the main process has fully completed.
   * The renderer should poll this before sending the first query.
   * Returns true once the crawler is initialized and QueryBus is ready.
   */
  isReady: (): Promise<boolean> =>
    ipcRenderer.invoke('crawler:ready'),

  /**
   * Execute a query on the main-process crawler.
   *
   * Flow:
   *   renderer calls window.crawlerAPI.query(name, dto)
   *   → ipcRenderer.send('transport:message', { action: 'query.request', ... })
   *   → ElectronIpcMainService in main process receives it
   *   → routes to QueryBus.execute()
   *   → result sent back as { action: 'query.response', data: ... }
   *   → promise resolves with the result
   */
  query: (name: string, dto?: any): Promise<any> =>
    client.query(name, dto),

  /**
   * Subscribe to domain events streamed from main via outbox.
   * Only relevant if TRANSPORT_OUTBOX_KIND=electron-ipc-main is configured.
   * Returns an unsubscribe function.
   */
  subscribe: (eventName: string, handler: (evt: any) => void): (() => void) =>
    client.subscribe(eventName, handler),
});
