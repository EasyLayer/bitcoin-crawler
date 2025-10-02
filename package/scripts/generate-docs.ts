#!/usr/bin/env ts-node
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, readdirSync, removeSync } from 'fs-extra';
import { generateConfigJson } from './generate-config-json';
import { generateQueryDocs } from './generate-query-docs';

async function main() {
  try {
    // 1. Generate JSON schemas into .tmp
    console.log('🔧 Generating config schemas…');
    generateConfigJson('.tmp');
    
    console.log('📋 Generating query documentation…');
    await generateQueryDocs('.tmp');
    
    // 2. Build markdown sections
    const configMd = buildConfigMarkdown('.tmp');
    const queryMd = buildQueryMarkdown('.tmp');
    
    // 3. Update DOCS.md
    let docs = readFileSync(resolve(__dirname, '../DOCS.md'), 'utf8');
    
    // Replace config section
    const configBlock = `<!-- CONFIG-START -->\n## Configuration Reference\n\n${configMd}\n<!-- CONFIG-END -->`;
    docs = docs.replace(/<!-- CONFIG-START -->[\s\S]*?<!-- CONFIG-END -->/, configBlock);
    
    // Replace query section  
    const queryBlock = `<!-- QUERY-API-START -->\n${queryMd}\n<!-- QUERY-API-END -->`;
    docs = docs.replace(/<!-- QUERY-API-START -->[\s\S]*?<!-- QUERY-API-END -->/, queryBlock);
    
    // 4. Write back and clean up
    writeFileSync(resolve(__dirname, '../DOCS.md'), docs, 'utf8');
    removeSync('.tmp');
    
    console.log('✅ DOCS.md updated with config and query documentation.');
  } catch (error) {
    console.error('❌ Error generating documentation:', error);
    process.exit(1);
  }
}

function buildConfigMarkdown(tmpDir: string): string {
  // Read each .tmp/*.json and build Markdown tables
  const files = readdirSync(tmpDir).filter(f => f.endsWith('.json') && f !== 'queries.json');
  
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
      const def = prop.default !== undefined ? `\`${JSON.stringify(prop.default)}\`` : '';
      const req = required.has(key) ? '✅' : '';
      md += `| \`${key}\` | ${type} | ${desc} | ${def} | ${req} |\n`;
    }
    
    return md;
  });
  
  return mdSections.join('\n');
}

function buildQueryMarkdown(tmpDir: string): string {
  const queryDocPath = resolve(tmpDir, 'queries.json');
  
  try {
    const queryDoc = JSON.parse(readFileSync(queryDocPath, 'utf8'));
    
    let md = `## Query API Reference\n\n`;
    
    // Group by category
    const categories = [...new Set(queryDoc.queries.map((q: any) => q.category))];
    
    categories.forEach(category => {
      md += `### ${category} Queries\n\n`;
      
      const categoryQueries = queryDoc.queries.filter((q: any) => q.category === category);
      
      categoryQueries.forEach((query: any) => {
        md += `#### ${query.name}\n\n`;
        md += `${query.description}\n\n`;
        
        if (query.streaming) {
          md += `🔄 **Supports Streaming**\n\n`;
        }
        
        // Parameters table
        if (Object.keys(query.parameters).length > 0) {
          md += '**Parameters:**\n\n';
          md += '| Parameter | Type | Required | Description | Default | Example |\n';
          md += '|-----------|------|----------|-------------|---------|----------|\n';
          
          Object.entries(query.parameters).forEach(([key, param]: [string, any]) => {
            const req = param.required ? '✅' : '';
            const def = param.default !== undefined ? `\`${JSON.stringify(param.default)}\`` : '';
            const example = param.example ? `\`${JSON.stringify(param.example)}\`` : '';
            const type = param.type || 'any';
            md += `| \`${key}\` | ${type} | ${req} | ${param.description} | ${def} | ${example} |\n`;
          });
          md += '\n';
        }
        
        // Examples
        if (query.examples.request) {
          md += '**Example Request:**\n\n';
          md += '```json\n';
          md += JSON.stringify(query.examples.request, null, 2);
          md += '\n```\n\n';
        }
        
        if (query.examples.response) {
          md += '**Example Response:**\n\n';
          md += '```json\n';
          md += JSON.stringify(query.examples.response, null, 2);
          md += '\n```\n\n';
        }
        
        md += '---\n\n';
      });
    });
    
    return md;
  } catch (error) {
    console.error('❌ Error reading query documentation:', error);
    return '## Query API Reference\n\n*Error generating query documentation*\n\n';
  }
}

// CLI entry point
if (require.main === module) {
  main().catch(console.error);
}