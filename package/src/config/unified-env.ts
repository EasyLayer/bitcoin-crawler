/**
 * Unified env reader.
 *
 * Priority (highest to lowest):
 *   1. window.__ENV   — injected by the host page before the bundle loads
 *   2. process.env    — Node / Electron main / polyfilled by bundler
 *
 * Usage in browser:
 *   Before loading the crawler bundle, set:
 *     window.__ENV = {
 *       NETWORK_TYPE: 'mainnet',
 *       PROVIDER_NETWORK_RPC_URLS: 'http://localhost:8332',
 *       TRANSPORT_OUTBOX_ENABLE: '1',
 *       TRANSPORT_OUTBOX_KIND: 'http',
 *       TRANSPORT_HTTP_WEBHOOK_URL: 'http://localhost:3000/webhook',
 *       // ...
 *     };
 */

export type EnvLike = Record<string, string | undefined>;

export function getUnifiedEnv(): EnvLike {
  // Browser / Electron renderer: values injected into window before bundle load
  const fromWindow: EnvLike =
    typeof window !== 'undefined' && typeof (window as any).__ENV === 'object' && (window as any).__ENV !== null
      ? ((window as any).__ENV as EnvLike)
      : {};

  // Node / Electron main (also present in some bundler environments as a shim)
  const fromProcess: EnvLike =
    typeof process !== 'undefined' && process !== null && typeof process.env === 'object' && process.env !== null
      ? (process.env as EnvLike)
      : {};

  // window.__ENV overrides process.env for any key it defines
  return { ...fromProcess, ...fromWindow };
}
