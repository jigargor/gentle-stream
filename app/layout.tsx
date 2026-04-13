import type { Metadata } from "next";
import "./globals.css";
import { APP_LOGO_SRC } from "@/lib/brand/logo";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";

export const metadata: Metadata = {
  title: "Gentle Stream",
  description:
    "Uplifting stories from around the world — a calmer broadsheet feed, delivered with care.",
  icons: {
    icon: [{ url: APP_LOGO_SRC, type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Gentle Stream",
    description: "Only the uplifting. Only the inspiring.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect for Google Fonts performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      {/* suppressHydrationWarning: browser extensions often inject attrs on <body> (e.g. cz-shortcut-listen) */}
      <body suppressHydrationWarning>
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
