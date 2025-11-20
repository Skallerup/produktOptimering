import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  fallback: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  fallback: ["ui-monospace", "SFMono-Regular", "Monaco", "monospace"],
});

export const metadata: Metadata = {
  title: "ProduktOptimering | WooCommerce AI-assistent",
  description:
    "Scan WooCommerce produkter, gem dem i Supabase og lad AI foreslå optimeringer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} bg-slate-950 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
