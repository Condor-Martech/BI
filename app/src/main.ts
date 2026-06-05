import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import * as Sentry from "@sentry/node";
import { DocConfig } from './doc.config';

let app: any;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create(AppModule);
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    // CORS — gated por env var CORS_ALLOWED_ORIGINS (CSV).
    // Si está vacía o seteada a "*" → comportamiento legacy (origin abierto).
    // Si lista concreta → allowlist estricta. Mantener BFF de legacy/web-next en localhost:3002.
    const rawOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "").trim();
    const isAllowAll = rawOrigins === "" || rawOrigins === "*";
    const allowedOrigins = isAllowAll
      ? "*"
      : rawOrigins.split(",").map((o) => o.trim()).filter(Boolean);

    app.enableCors({
      origin: allowedOrigins,
      allowedHeaders: ["Authorization", "Content-Type", "Accept", "Cache-Control"],
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      exposedHeaders: ["Content-Disposition"],
      credentials: !isAllowAll, // credentials no se pueden combinar con origin:"*"
      maxAge: 600,
    });
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 1.0,
    });
    if (process.env.NODE_ENV !== 'production') {
      DocConfig(app);
    }
    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    await app.init()
  }
  return app;
}
// Handler serverless para Vercel
export default async (req: any, res: any) => {
  const app = await bootstrap();
  const server = app.getHttpAdapter().getInstance();
  server(req, res);
};

// Para desarrollo local
if (process.env.NODE_ENV !== 'production') {
  bootstrap().then(app => app.listen(3000));
}