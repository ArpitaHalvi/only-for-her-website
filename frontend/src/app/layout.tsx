import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Jost, Manrope } from "next/font/google";
import "./globals.css";
import "./pages.css";
import "./cart.css";
import "./checkout.css";
import "./scrollbars.css";
import "./auth.css";
import "./account.css";
import "./track.css";
import "./home.css";
import AnnouncementBar from "@/components/AnnouncementBar";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { StoreProvider } from "@/components/StoreProvider";
import PageMotion from "@/components/PageMotion";
import { ConfigProvider } from "@/lib/config";
import { CatalogProvider } from "@/lib/catalog";

const display = Jost({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const text = Manrope({
  variable: "--font-text",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Only For Her | Jewellery for your beauty & beliefs",
  description:
    "Necklaces, earrings, rings, bracelets and divine jewellery designed to be worn every day. Shop Only For Her.",
};

export const viewport: Viewport = {
  themeColor: "#640F2B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body>
        <ConfigProvider>
        <CatalogProvider>
        <StoreProvider>
          <a href="#main" className="skip">Skip to content</a>
          <AnnouncementBar />
          <Header />
          {children}
          <Footer />
          <Suspense fallback={null}>
            <PageMotion />
          </Suspense>
        </StoreProvider>
        </CatalogProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
