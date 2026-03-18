import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Good News Daily",
  description:
    "All the news that lifts the spirit — uplifting stories from around the world, delivered in a classic broadsheet experience.",
  openGraph: {
    title: "The Good News Daily",
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
