import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const isDev = config.get('APP_ENV') === 'development';

  // ─── Security Headers ────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: isDev ? false : undefined,
    }),
  );

  // ─── Rate Limiting ───────────────────────────────────────────────
  // Global: 200 requests per 15 minutes per IP
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: ['Too many requests. Please slow down.'] },
    }),
  );

  // Strict: wallet top-up — 10 per 15 minutes per IP
  app.use(
    '/api/v1/wallet/topup',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: ['Too many top-up attempts. Try again later.'] },
    }),
  );

  // Strict: call initiation — 20 per 15 minutes per IP
  app.use(
    '/api/v1/calls/initiate',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: ['Too many call attempts. Try again later.'] },
    }),
  );

  // ─── CORS ────────────────────────────────────────────────────────
  app.enableCors({
    origin: config.get('FRONTEND_URL'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ─── Global Prefix ───────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ─── Validation ──────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ─── Interceptors & Filters ──────────────────────────────────────
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<number>('APP_PORT') || 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}/api/v1`);
}

bootstrap();
