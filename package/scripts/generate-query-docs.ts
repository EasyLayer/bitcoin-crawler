#!/usr/bin/env ts-node
import 'reflect-metadata';
import { resolve } from 'node:path';
import { writeFileSync, ensureDirSync } from 'fs-extra';
import { targetConstructorToSchema } from 'class-validator-jsonschema';
import { QUERY_DOC_METADATA_KEY } from '@easylayer/common/shared-interfaces';
import { AllQueries, AllQueryDtoMap } from '@easylayer/bitcoin';

interface ParameterDoc {
  type?: string;
  description?: string;
  required?: boolean;
  default?: any;
  example?: any;
  minimum?: number;
  maximum?: number;
}

interface queryDocInterface {
  name: string;
  category: string;
  description: string;
  streaming: boolean;
  parameters: Record<string, ParameterDoc>;
  examples: Record<string, any>;
  schema: any | null;
}

export async function generateQueryDocs(outputFolder = '.tmp') {
  ensureDirSync(outputFolder);
  
  const queryDocs: any[] = [];
  
  for (const QueryClass of AllQueries) {
    // Get documentation metadata from @QueryDoc decorator
    const docMetadata = Reflect.getMetadata(QUERY_DOC_METADATA_KEY, QueryClass);
    
    if (!docMetadata) {
      console.log(`⚠️ No documentation metadata for ${QueryClass.name}, skipping.`);
      continue;
    }
    
    // Get corresponding DTO class and generate schema
    const DtoClass = AllQueryDtoMap.get(QueryClass);
    let schema: any = null;
    
    if (DtoClass) {
      try {
        schema = targetConstructorToSchema(DtoClass);
        console.log(`✅ Generated schema for ${QueryClass.name}`);
      } catch (error) {
        console.log(`⚠️ Could not generate schema for ${QueryClass.name}:`, error);
      }
    } else {
      console.log(`⚠️ No DTO class found for ${QueryClass.name}`);
    }
    
    // Build query documentation object
    const queryDoc: queryDocInterface = {
      name: QueryClass.name,
      category: docMetadata.category,
      description: docMetadata.description,
      streaming: docMetadata.streaming || false,
      parameters: {},
      examples: docMetadata.examples || {},
      schema: schema
    };
    
    // Extract parameter information from JSON Schema (from @JSONSchema decorators)
    if (schema?.properties) {
      Object.entries(schema.properties).forEach(([param, propSchema]: [string, any]) => {
        queryDoc.parameters[param] = {
          type: propSchema.type,
          description: propSchema.description || '',
          required: schema.required?.includes(param) || false,
          default: propSchema.default,
          example: propSchema.example,
          minimum: propSchema.minimum,
          maximum: propSchema.maximum
        };
      });
    }
    
    queryDocs.push(queryDoc);
  }
  
  const result = {
    title: 'Query API Reference',
    // generated: new Date().toISOString(),
    // totalQueries: queryDocs.length,
    queries: queryDocs
  };
  
  const outPath = resolve(outputFolder, 'queries.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`✅ Generated query docs: ${outPath} (${queryDocs.length} queries)`);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0] || '.tmp';
  generateQueryDocs(outDir).catch(console.error);
}