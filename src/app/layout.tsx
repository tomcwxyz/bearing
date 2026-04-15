import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://findbearing.org";

export const metadata: Metadata = {
  title: {
    default: "Bearing — Find the right AI model",
    template: "%s | Bearing",
  },
  description:
    "Describe what you want to do, set your priorities, get a ranked shortlist of AI models with transparent scoring across quality, cost, speed, privacy, sustainability and more.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "Bearing",
    title: "Bearing — Find the right AI model",
    description:
      "Transparent AI model recommendations. Describe your task, set your priorities, get a ranked shortlist scored across 7 factors.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bearing — Find the right AI model",
    description:
      "Transparent AI model recommendations scored across quality, cost, speed, privacy, sustainability, transparency and capability.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: siteUrl,
  },
  other: {
    "theme-color": "#1B2A4A",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full flex flex-col font-body">
        <Nav />

        <main className="flex-1">{children}</main>

        <footer className="border-t border-cream-dark px-6 py-6 text-center text-sm text-grey-blue">
          Built by{" "}
          <a
            href="https://good-ship.co.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-navy transition-colors"
          >
            The Good Ship
          </a>
        </footer>
      </body>
    </html>
  );
}
