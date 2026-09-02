import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Shell } from "@/components/Shell";
import { navCounts } from "@/lib/snapshot";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SMEAI — agents on BNB Chain that actually answer",
  description:
    "An agent marketplace for BNB Chain that calls every agent's endpoint before listing it. Rebalancing, grid trading, yield and health factor agents, with live proof that they respond.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Los conteos se calculan aquí, en servidor, y viajan al Shell como props.
  // Si el Shell (que es cliente) importase el snapshot, mandaríamos 232 KB de
  // JSON al navegador para pintar cuatro números.
  const nav = navCounts();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg font-sans">
        <Shell nav={nav}>{children}</Shell>
      </body>
    </html>
  );
}
