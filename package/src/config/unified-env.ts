// export type EnvLike = Record<string, any>;

// export function getUnifiedEnv(): EnvLike {
//   // if it's a browser, we take what was added before loading
//   const fromWindow =
//     typeof window !== 'undefined' && (window as any).__ENV
//       ? (window as any).__ENV
//       : undefined;

//   // if Vite/esm - you can pull up import.meta.env
// //   const fromImportMeta =
// //     typeof import.meta !== 'undefined' && (import.meta as any).env
// //       ? (import.meta as any).env
// //       : undefined;

//   // 3) Node/Electron
//   const fromProcess =
//     typeof process !== 'undefined' && process.env ? process.env : undefined;

//   return {
//     ...(fromProcess || {}),
//     // ...(fromImportMeta || {}),
//     ...(fromWindow || {}),
//   };
// }
