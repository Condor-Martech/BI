import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { OpenPanelComponent } from "@openpanel/nextjs";

import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Power BI — Plataforma",
  description: "Plataforma Power BI multi-tenant. Frontend Next.js para el backend legacy NestJS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID && (
          <OpenPanelComponent
            clientId={process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID}
            trackScreenViews
            trackOutgoingLinks
            trackAttributes
          />
        )}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
