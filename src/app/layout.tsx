import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal de soporte inteligente | SONDA",
  description: "Plataforma enterprise de soporte ITSM asistida por inteligencia operacional.",
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
