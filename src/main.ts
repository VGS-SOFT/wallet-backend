import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Global prefix for all routes
  app.setGlobalPrefix('api/v1');

  // Enable CORS for frontend
  app.enableCors({
    origin: config.get('FRONTEND_URL'),
    credentials: true,
  });

  // Global validation pipe — auto-validates all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown fields
      forbidNonWhitelisted: true,
      transform: true,       // auto-transform types
    }),
  );

  // Global response interceptor — consistent API shape
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global exception filter — consistent error shape
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<number>('APP_PORT') || 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}/api/v1`);
}

bootstrap();
