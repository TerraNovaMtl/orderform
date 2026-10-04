import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Terra Nova | Wholesale",
  description: "Terra Nova wholesale ordering portal",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
