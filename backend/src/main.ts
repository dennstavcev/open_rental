import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // CORS для фронтенда (другой origin). Список origin'ов — из CORS_ORIGIN
  // (через запятую); по умолчанию в dev отражаем любой origin. Токены — в
  // заголовке Authorization, cookie не используются.
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',') : true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
