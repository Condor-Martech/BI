import { readFileSync } from "node:fs";
import { join } from "node:path";
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

export default nextConfig;
