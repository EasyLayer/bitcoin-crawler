export interface BootstrapConfig {
  /**
   * Authoritative last processed block height provided by the bootstrap caller.
   * When set, this value has priority over START_BLOCK_HEIGHT from env.
   */
  lastBlockHeight?: number;
}

export const BOOTSTRAP_CONFIG = 'BootstrapConfig';
