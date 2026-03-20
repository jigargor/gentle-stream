import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gentle Stream",
  description:
    "Uplifting stories from around the world — a calmer broadsheet feed, delivered with care.",
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
    <html lang="en">
      <head>
        {/* Preconnect for Google Fonts performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
