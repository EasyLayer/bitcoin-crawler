#!/usr/bin/env ts-node
import { resolve, basename } from 'node:path';
import { writeFileSync, ensureDirSync, readdirSync } from 'fs-extra';
import { targetConstructorToSchema } from 'class-validator-jsonschema';
import * as sharedConfigs from '../src/config';

type ConfigConstructor = new (...args: any[]) => any;

/**
 * Dynamically load all .ts files from a config subfolder and prefix
 * every exported class name with the folder name to avoid collisions.
 *
 * e.g. TransportConfig in config/node/  → key "node.transportconfig"
 *      TransportConfig in config/browser/ → key "browser.transportconfig"
 */
function loadSubfolderConfigs(
  folderPath: string,
  folderAlias: string
): Map<string, ConfigConstructor> {
  const map = new Map<string, ConfigConstructor>();

  let files: string[];
  try {
    files = readdirSync(folderPath).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.d.ts')
    );
  } catch {
    return map; // folder doesn't exist yet — skip silently
  }

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(resolve(folderPath, file));
    for (const [, v] of Object.entries(mod)) {
      if (typeof v === 'function' && (v as any).prototype) {
        const key = `${folderAlias}.${(v as ConfigConstructor).name.toLowerCase()}`;
        map.set(key, v as ConfigConstructor);
      }
    }
  }

  return map;
}

function buildConfigMap(): Map<string, ConfigConstructor> {
  const map = new Map<string, ConfigConstructor>();

  // 1. Shared configs from src/config/index — no prefix
  for (const v of Object.values(sharedConfigs)) {
    if (typeof v === 'function') {
      map.set((v as ConfigConstructor).name.toLowerCase(), v as ConfigConstructor);
    }
  }

  // 2. Node-specific configs — prefixed with "node."
  const nodeConfigs = loadSubfolderConfigs(
    resolve(__dirname, '../src/config/node'),
    'node'
  );
  for (const [k, v] of nodeConfigs) map.set(k, v);

  // 3. Browser-specific configs — prefixed with "browser."
  const browserConfigs = loadSubfolderConfigs(
    resolve(__dirname, '../src/config/browser'),
    'browser'
  );
  for (const [k, v] of browserConfigs) map.set(k, v);

  return map;
}

export function generateConfigJson(outputFolder = '.tmp') {
  ensureDirSync(outputFolder);

  for (const [filename, ConfigClass] of buildConfigMap()) {
    const schema = targetConstructorToSchema(ConfigClass as any);
    if (!schema) {
      console.log(`⚠️  No schema for ${ConfigClass.name} (${filename}), skipping.`);
      continue;
    }

    // Strip properties without a description
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (!(prop as any)?.description) {
          delete schema.properties[key];
        }
      }
    }

    schema.title = ConfigClass.name;

    const outPath = resolve(outputFolder, `${filename}.json`);
    writeFileSync(outPath, JSON.stringify(schema, null, 2), 'utf8');
    console.log(`✅  Generated: ${outPath}`);
  }
}

if (require.main === module) {
  const outDir = process.argv[2] || '.tmp';
  generateConfigJson(outDir);
}
