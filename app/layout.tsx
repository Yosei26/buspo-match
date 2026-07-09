import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buspo Match",
  description: "中学・高校野球向けの練習試合募集MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
