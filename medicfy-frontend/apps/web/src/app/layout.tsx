import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, Montserrat, Source_Sans_3 } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n/context";
import { HTML_LANG } from "@/lib/i18n/config";
import { getLocale, createTranslator } from "@/lib/i18n/server";
import "./globals.css";

// Sistema de diseño "Parte A": Archivo para encabezados de producto,
// Source Sans 3 para cuerpo/UI. Montserrat queda reservada al wordmark
// "Medicfy" y material de marketing — nunca al resto de la interfaz.
// next/font self-hosts at build time — no runtime request a Google Fonts.
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-heading-family", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-body-family", display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["700"], variable: "--font-brand-family", display: "swap" });

// El título y la descripción también cambian con el idioma: son lo
// primero que lee un buscador y lo que aparece en la pestaña.
export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return {
    title: "Medicfy",
    description: t("landing.meta.descripcion"),
  };
}

// Leer la cookie de idioma aquí vuelve dinámico el render de toda la
// app. Es el precio de no meter el idioma en la URL (/es/pacientes,
// /en/patients): las rutas se quedan como están y ningún enlace ya
// compartido se rompe.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={HTML_LANG[locale]} className={`${archivo.variable} ${sourceSans.variable} ${montserrat.variable}`}>
      <body>
        <I18nProvider initialLocale={locale}>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
