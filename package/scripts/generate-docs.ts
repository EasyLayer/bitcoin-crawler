#!/usr/bin/env ts-node
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, readdirSync, removeSync } from 'fs-extra';
import { generateConfigJson } from './generate-config-json';

// 1. Generate JSON schemas into .tmp
console.log('🔧 Generating config schemas…');
generateConfigJson('.tmp');

// 2. Read each .tmp/*.json and build Markdown tables
const tmpDir = '.tmp';
const files = readdirSync(tmpDir).filter(f => f.endsWith('.json'));
const mdSections = files.map(file => {
  const schema = JSON.parse(readFileSync(resolve(tmpDir, file), 'utf8'));
  const title = schema.title;
  const required = new Set(schema.required || []);

  let md = `### ${title}\n\n`;
  md += '| Property | Type | Description | Default | Required |\n';
  md += '|---|---|---|---|:---:|\n';

  for (const [key, prop] of Object.entries<any>(schema.properties || {})) {
    const type = Array.isArray(prop.type) ? prop.type.join(' | ') : prop.type;
    const desc = (prop.description || '').replace(/\r?\n/g, ' ');
    const def  = prop.default !== undefined ? `\`${JSON.stringify(prop.default)}\`` : '';
    const req  = required.has(key) ? '✅' : '';
    md += `| \`${key}\` | ${type} | ${desc} | ${def} | ${req} |\n`;
  }

//   if (required.size) {
//     md += `\n> **Required properties:** ${[...required].map(r => `\`${r}\``).join(', ')}\n`;
//   }

  return md;
});

// 3. Inject into DOCS.md between CONFIG-START / CONFIG-END
const docsPath = resolve(__dirname, '../DOCS.md');
let docs = readFileSync(docsPath, 'utf8');
const configBlock = `<!-- CONFIG-START -->
## Configuration Reference

${mdSections.join('\n')}

<!-- CONFIG-END -->`;
docs = docs.replace(/<!-- CONFIG-START -->[\s\S]*?<!-- CONFIG-END -->/, configBlock);

// 4. Write back and clean up
writeFileSync(docsPath, docs, 'utf8');
removeSync(tmpDir);

console.log('✅ DOCS.md updated, and .tmp cleaned up.');
