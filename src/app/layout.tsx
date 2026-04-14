import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bearing — Find the right AI model",
  description:
    "Describe what you want to do, set your priorities, get a ranked shortlist of AI models with transparent scoring.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
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
