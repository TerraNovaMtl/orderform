import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Terra Nova | Wholesale",
  description: "Terra Nova wholesale ordering portal",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      {
        url: "/terra-nova-monogram-v2.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        url: "/terra-nova-monogram-v2.png",
        sizes: "256x256",
        type: "image/png",
      },
    ],
    shortcut: "/terra-nova-monogram-v2.ico",
    apple: {
      url: "/terra-nova-touch-v2.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
