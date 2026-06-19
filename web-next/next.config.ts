import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Versão da plataforma lida do package.json em build time (fonte única de verdade).
// Exposta como NEXT_PUBLIC_* para ficar disponível em Server e Client Components,
// sem importar o package.json inteiro para o bundle.
const { version } = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as { version: string };

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io", "10.1.2.62"],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

// Sin tunnelRoute: web-next no define CSP, así que el SDK envía directo a Sentry.
export default withSentryConfig(nextConfig, {
  // Subida de source maps — no-op si estas env vars no están (dev/local).
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});

