import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { Header } from "@/components/layout/header";
import { TabBar } from "@/components/layout/tab-bar";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { SplashScreen } from "@/components/layout/splash-screen";
import { CookieBanner } from "@/components/shared/cookie-banner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PokeMarket — Marketplace de cartes Pokémon TCG",
    template: "%s | PokeMarket",
  },
  description:
    "Achetez et vendez des cartes Pokémon TCG entre particuliers. Paiement sécurisé, négociation par offres, messagerie temps réel.",
  manifest: "/manifest.json",
  applicationName: "PokeMarket",
  appleWebApp: {
    capable: true,
    title: "PokeMarket",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "PokeMarket",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f1a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col antialiased">
        <SplashScreen />
        <Providers>
          <Header />
          <main className="flex-1 pb-16 lg:pb-0">{children}</main>
          <TabBar />
        </Providers>
        <InstallPrompt />
        <ServiceWorkerRegister />
        <CookieBanner />
      </body>
    </html>
  );
}
