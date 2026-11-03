import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ quiet: true });
import { createServer, type Server } from 'node:http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { PrismaService } from './platform/prisma/prisma.service';
import { WorkerModule } from './worker/worker.module';

/**
 * Sonde de santé du worker, ouverte seulement si WORKER_HTTP_PORT est renseigné.
 *
 * Un conteneur Scaleway (comme la plupart des hébergeurs de conteneurs) exige un processus qui
 * écoute sur un port : sans lui, le worker est déclaré « unable to start » alors qu'il tourne.
 * En local, la variable reste vide : le worker ne dispute pas le port 3000 à l'API.
 */
export function startHealthServer(app: INestApplicationContext, port: number): Server {
  const prisma = app.get(PrismaService);
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || (req.url !== '/health' && req.url !== '/')) {
      res.writeHead(404).end();
      return;
    }
    prisma.$queryRaw`SELECT 1`
      .then(() => res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok","process":"worker"}'))
      .catch(() => res.writeHead(503, { 'content-type': 'application/json' }).end('{"status":"error","process":"worker"}'));
  });
  server.listen(port);
  return server;
}

export async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  const port = Number(process.env.WORKER_HTTP_PORT || 0);
  if (port > 0) {
    const server = startHealthServer(app, port);
    const close = () => server.close();
    process.once('SIGTERM', close);
    process.once('SIGINT', close);
    Logger.log(`Sonde de santé du worker sur :${port}/health`, 'Bootstrap');
  }
  Logger.log('Worker Rekonect démarré', 'Bootstrap');
  return app;
}

if (require.main === module) void bootstrapWorker();
