import type { Metadata } from "next";
import "./globals.css";
import { PwaInstall } from "@/components/shared/PwaInstall";

export const metadata: Metadata = {
  title: "Asistente ITSM | Forum",
  description: "Asistente ITSM instalable para soporte, tickets y seguimiento.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Forum ITSM",
  },
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
        <PwaInstall />
      </body>
    </html>
  );
}
