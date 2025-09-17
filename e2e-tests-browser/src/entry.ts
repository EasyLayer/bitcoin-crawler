// import 'reflect-metadata';
// import { bootstrap } from '@easylayer/bitcoin-crawler';
// import BlocksModel from '../../e2e-tests-server/src/reorganisation/blocks.model';
// // при необходимости: import { BitcoinNetworkBlocksAddedEvent } from '@easylayer/bitcoin';

// declare global {
//   interface Window {
//     __ENV?: Record<string, string>;
//     __e2e?: {
//       ready: Promise<void>;
//       getMetrics: () => Promise<any>;
//     };
//   }
// }

// // 1) «env» в браузере: склеиваем window.__ENV в process.env
// (function injectEnv() {
//   const extra = (window.__ENV ?? {}) as Record<string, string>;
//   const cur = (window as any).process?.env ?? {};
//   (window as any).process = { env: { ...cur, ...extra } };
// })();

// // 2) Старт приложения и экспорт e2e-API
// const ready = (async () => {
//   await bootstrap({
//     Models: [BlocksModel],
//     testing: {
//       // можно ожидать события, если нужно
//       // handlerEventsToWait: [{ eventType: BitcoinNetworkBlocksAddedEvent, count: 3 }],
//     },
//   });
// })();

// window.__e2e = {
//   ready,
//   // Изнутри страницы возвращаем метрики, читая sql.js через DataSource
//   // Чтение идёт обычным SQL (TypeORM sql.js driver выполняет его в памяти и синкает в IndexedDB).
//   async getMetrics() {
//     try {
//       await ready;

//       // Достаём EventStoreService из глобального Nest контекста.
//       // Точное имя токена зависит от твоего модуля, поэтому тут через глобал/any:
//       const anyGlobal = (globalThis as any);
//       const app = anyGlobal.__nestApp || anyGlobal.app || anyGlobal.__app; // подстрой если нужно
//       const eventStore = app?.get?.(require('@easylayer/common/eventstore').EventStoreService);
//       const ds = eventStore?.dataSource ?? eventStore?.getDataSource?.();

//       // Если нет прямого доступа к DataSource — сделай в своём коде helper, который вернёт нужные подсчёты.
//       if (!ds?.query) {
//         return { ok: false, error: 'No DataSource found (expose it for tests)' };
//       }

//       // Таблицы/типы — подстрой под свои имена
//       const networkRows = await ds.query(`SELECT type FROM network ORDER BY id ASC`).catch(() => []);
//       const userRows = await ds.query(`SELECT type FROM "BlocksModel" ORDER BY id ASC`).catch(() => []);

//       const out = {
//         ok: true,
//         network: {
//           total: networkRows.length,
//           blocksAddedEventsCount: networkRows.filter((r: any) => r.type === 'BitcoinNetworkBlocksAddedEvent').length,
//         },
//         user: {
//           blockEventsCount: userRows.filter((r: any) => r.type === 'BlockAddedEvent').length,
//         },
//       };
//       return out;
//     } catch (e: any) {
//       return { ok: false, error: String(e?.message ?? e) };
//     }
//   },
// };
