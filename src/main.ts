import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { ApiErrors } from './errors';
async function bootstrap() {
  mkdirSync('work', { recursive: true });
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const origin = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.use(helmet());
  app.use(json({ limit: '15mb' }));
  app.enableCors({ origin, credentials: true });
  const limits = new Map<string, { count: number; until: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.path !== '/api/v1/payments/webhook' &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin !== origin
    )
      return res
        .status(403)
        .json({ message: 'Origine de requête non autorisée.' });
    const key = `${req.ip}:${req.path.startsWith('/api/v1/auth') ? 'auth' : 'general'}`;
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry || entry.until < now) {
      entry = { count: 0, until: now + 60000 };
      limits.set(key, entry);
    }
    entry.count++;
    if (entry.count > (key.endsWith(':auth') ? 20 : 240))
      return res
        .status(429)
        .json({ message: 'Trop de tentatives. Réessayez dans une minute.' });
    if (limits.size > 10000)
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    next();
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiErrors());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Pletosie API')
      .setDescription(
        'Boutique, commandes et conversations. Authentification par cookie HttpOnly.',
      )
      .setVersion('1.0')
      .addCookieAuth('pletosie_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  await app.listen(process.env.PORT || 4000, process.env.HOST || '127.0.0.1');
  console.log(
    `Pletosie API : http://localhost:${process.env.PORT || 4000}/api/docs`,
  );
}
void bootstrap();
