import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const isDev = config.get('APP_ENV') === 'development';

  // ─── Security Headers (Helmet) ───────────────────────────────────────────
  // Sets: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
  // Strict-Transport-Security, Content-Security-Policy, etc.
  // Must be first middleware registered.
  app.use(
    helmet({
      // Allow Google OAuth redirects through CSP
      contentSecurityPolicy: isDev ? false : undefined,
    }),
  );

  // ─── CORS ────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: config.get('FRONTEND_URL'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ─── Global Prefix ───────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ─── Global Validation Pipe ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // strip fields not in DTO
      forbidNonWhitelisted: true, // throw on extra fields
      transform: true,           // auto-cast types (string -> number etc.)
    }),
  );

  // ─── Global Response Interceptor ─────────────────────────────────────────
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ─── Global Exception Filter ─────────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<number>('APP_PORT') || 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}/api/v1`);
}

bootstrap();
