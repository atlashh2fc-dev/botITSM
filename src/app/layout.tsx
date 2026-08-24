import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal de soporte inteligente | ITSM",
  description: "Panel operativo conectado a su tenant ITSM.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
