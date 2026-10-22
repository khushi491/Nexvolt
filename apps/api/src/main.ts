import 'dotenv/config';
import 'reflect-metadata';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { zodToOpenAPI } from 'nestjs-zod';
import type { ZodTypeAny } from 'zod';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './config/env';

export function buildOpenApi(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  const config = new DocumentBuilder()
    .setTitle('Nexvolt API')
    .setDescription(
      'Peer-to-peer EV charging marketplace (MVP — not production-ready). Money in paise, energy in Wh, times in UTC.',
    )
    .setVersion(env().APP_VERSION)
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  // Fill DTO component schemas from their zod definitions (single source of truth with validation).
  const schemas = ((doc.components ??= {}).schemas ??= {});
  for (const mod of app.get(ModulesContainer).values()) {
    for (const ctrl of mod.controllers.values()) {
      const proto = (ctrl.metatype as { prototype?: object } | null)?.prototype;
      if (!proto) continue;
      for (const key of Object.getOwnPropertyNames(proto)) {
        const types: unknown[] = Reflect.getMetadata('design:paramtypes', proto, key) ?? [];
        for (const t of types as Array<{
          name?: string;
          isZodDto?: boolean;
          schema?: ZodTypeAny;
        }>) {
          if (t?.isZodDto && t.schema && t.name) schemas[t.name] = zodToOpenAPI(t.schema) as never;
        }
      }
    }
  }
  return doc;
}

async function bootstrap() {
  const e = env(); // fail fast on invalid configuration
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({ origin: e.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: false });
  app.enableShutdownHooks();
  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set('trust proxy', 1);
  httpAdapter.disable('x-powered-by');

  if (e.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, buildOpenApi(app));
  }
  await app.listen(e.PORT);
  app.get(Logger).log(`Nexvolt API listening on :${e.PORT} (demo mode: ${e.LOCAL_DEMO_MODE})`);
}

if (require.main === module) void bootstrap();
