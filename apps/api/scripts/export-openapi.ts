/** Writes docs/openapi.json from the running module graph (requires DB/Redis env like the API). */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { buildOpenApi } from '../src/main';

async function run() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  const doc = buildOpenApi(app);
  const out = join(__dirname, '../../../docs/openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  await app.close();
  console.log(`Wrote ${Object.keys(doc.paths).length} paths to ${out}`);
  process.exit(0);
}
void run();
