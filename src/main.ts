import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { CaptureErrorFilter } from './common/filters/capture-error.filter';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(requestIdMiddleware);

  app.useGlobalFilters(new CaptureErrorFilter());

  const allowedOrigins: readonly string[] = [
    'https://nemoryai.com',
    'https://www.nemoryai.com',
    'https://api.nemoryai.com',
    'http://localhost:3000',
    'https://localhost:3000',
  ];

  app.useStaticAssets(process.env.UPLOADS_DIR || '/var/www/nemory-uploads', {
    prefix: process.env.UPLOADS_PUBLIC_PREFIX || '/uploads',
  });

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ): void => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SelfUpgrade API')
    .setDescription('AI diary REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SelfUpgrade API')
      .setDescription('AI diary REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document);
  }

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', true);

  const port = parseInt(process.env.PORT ?? '3001', 10);
  const host = process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host);

  console.log(`App listening on http://${host}:${port}`);
}
bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
