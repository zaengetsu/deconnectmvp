import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ quiet: true });
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

export async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log('Worker Rekonect démarré', 'Bootstrap');
  return app;
}

if (require.main === module) void bootstrapWorker();
