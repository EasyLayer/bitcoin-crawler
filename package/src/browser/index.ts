export { bootstrap } from './bootstrap';
export type { BrowserBootstrapOptions } from './bootstrap';
export * from './app.module';
// Same framework exports as node index — Model, ModelFactoryService, ModelInput, etc.
// These are pure TypeScript with no Node-only deps, safe for browser builds.
export * from '../domain-layer/framework';
