#!/usr/bin/env ts-node
import { resolve } from 'node:path';
import { writeFileSync, ensureDirSync } from 'fs-extra';
import { targetConstructorToSchema } from 'class-validator-jsonschema';
import * as currentConfigs from '../src/config';

type ConfigConstructor = new (...args: any[]) => any;

export function generateConfigJson(outputFolder = '.tmp') {
  // Clear or create the .tmp folder
  ensureDirSync(outputFolder);

  Object.values(currentConfigs)
    .filter(v => typeof v === 'function')
    .forEach((ConfigClass: ConfigConstructor) => {
      const schema = targetConstructorToSchema(ConfigClass as any);
      
      if (!schema) {
        console.log(`⚠️  No schema for ${ConfigClass.name}, skipping.`);
        return;
      }

      // Strip out properties missing a description
      if (schema.properties) {
        Object.entries(schema.properties).forEach(([key, prop]: any) => {
          if (prop && !prop.description) {
            delete schema.properties![key];
          }
        });
      }

      // Add the class name as title
      schema.title = ConfigClass.name;

      // Write JSON to .tmp/<classname>.json
      const outPath = resolve(outputFolder, `${ConfigClass.name.toLowerCase()}.json`);
      writeFileSync(outPath, JSON.stringify(schema, null, 2), 'utf8');
      console.log(`✅  Generated schema: ${outPath}`);
    });
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0] || '.tmp';
  generateConfigJson(outDir);
}
