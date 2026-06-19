import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // ponytail: 0.1 alineado con el resto de las apps; env-tune si hace falta.
  tracesSampleRate: 0.1,
});

// Necesario para el tracing de navegación del App Router (Next 15.3+).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
