import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, Montserrat, Source_Sans_3 } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

// Sistema de diseño "Parte A": Archivo para encabezados de producto,
// Source Sans 3 para cuerpo/UI. Montserrat queda reservada al wordmark
// "Medicfy" y material de marketing — nunca al resto de la interfaz.
// next/font self-hosts at build time — no runtime request a Google Fonts.
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-heading-family", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-body-family", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["700"], variable: "--font-brand-family", display: "swap" });

export const metadata: Metadata = {
  title: "Medicfy",
  description: "La herramienta clínica del médico privado mexicano.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX" className={`${archivo.variable} ${sourceSans.variable} ${montserrat.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
