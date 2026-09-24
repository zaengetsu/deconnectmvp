import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ quiet: true });
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ENV, type Env } from './config/env';

export async function bootstrap() {
  // rawBody : nécessaire à la vérification de signature des webhooks Stripe.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  const env = app.get<Env>(ENV);
  app.use(helmet());
  app.enableCors({ origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  Logger.log(`API Rekonect sur http://localhost:${env.PORT}`, 'Bootstrap');
  return app;
}

if (require.main === module) void bootstrap();
