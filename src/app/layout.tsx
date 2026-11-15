import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = { title: { default: "FORTE CRM", template: "%s · FORTE CRM" }, description: "Centro de comando comercial, financeiro e operacional da Forte Company.", icons: { icon: "/brand/logo-mark.png" } };
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
            <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
