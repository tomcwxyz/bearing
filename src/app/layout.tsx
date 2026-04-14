import type { Metadata } from "next";
import Link from "next/link";
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
        <header className="bg-navy text-cream border-b border-navy-light">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-display text-xl font-bold tracking-tight">
              Bearing
            </Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/models" className="hover:text-grey-blue-light transition-colors">
                Models
              </Link>
              <Link href="/compare" className="hover:text-grey-blue-light transition-colors">
                Compare
              </Link>
              <Link href="/data" className="hover:text-grey-blue-light transition-colors">
                Data
              </Link>
              <Link href="/about" className="hover:text-grey-blue-light transition-colors">
                About
              </Link>
              <Link href="/auth/signin" className="hover:text-grey-blue-light transition-colors">
                Sign in
              </Link>
            </div>
          </nav>
        </header>

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
