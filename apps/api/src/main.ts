import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { env } from './config/env';

export function buildOpenApi(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  const config = new DocumentBuilder()
    .setTitle('Nexvolt API')
    .setDescription('Peer-to-peer EV charging marketplace (MVP — not production-ready). Money in paise, energy in Wh, times in UTC.')
    .setVersion(env().APP_VERSION)
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
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
