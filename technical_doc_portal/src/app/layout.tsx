import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Inter for all interface text (variable font, so every weight is available).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: { default: "NSK Technical Information Portal", template: "%s · NSK Technical Information Portal" },
  description: "Official NSK technical information for authorised dealers and distributors.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
