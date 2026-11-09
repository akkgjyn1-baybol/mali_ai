import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

const sans = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-outfit",
});

const serif = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: "Mali",
  description: "Мали — Малишь. Помнит тебя и меняется вместе с тобой.",
  applicationName: "Mali",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mali",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192" },
      { url: "/icon-512.png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#070709",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${sans.variable} ${serif.variable} font-sans antialiased mirror-bg`}>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
