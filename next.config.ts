import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'loopback-network=(self), local-network=(self), local-network-access=(self)',
          },
        ],
      },
    ]
  },
  // @napi-rs/canvas ships a native (napi-rs/Rust) binary loader —
  // js-binding.js — that Turbopack can't trace into an ESM chunk ("asset is
  // not placeable in ESM chunks"). pdf-parse (via pdfjs-dist) resolves its
  // worker script from a path relative to its own bundled file at runtime
  // ("./pdf.worker.mjs"); when Turbopack bundles pdf-parse into a single
  // chunk, that sibling file never ships with it, producing "Cannot find
  // module '.../pdf.worker.mjs'" in production. Marking both external tells
  // Next.js to require() them directly from node_modules at runtime instead
  // of bundling them, so each package's own file layout (and its worker
  // file) stays intact.
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  // Externalizing pdf-parse fixed pdf-parse's own worker file, but pdfjs-dist
  // (pdf-parse's dependency) sets `workerSrc` to another relative path
  // ("./pdf.worker.mjs") that pdf.js loads via a runtime string, not a
  // statically-analyzable require()/import() — so Vercel's file tracer
  // (@vercel/nft) never discovers it and leaves it out of the deployed
  // function, producing "Cannot find module
  // '.../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'" in production
  // even though the file exists in node_modules. outputFileTracingIncludes
  // force-includes it regardless of what static analysis can see.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/pdfjs-dist/**/*.worker.mjs",
      "./node_modules/pdf-parse/**/*.worker.mjs",
    ],
  },
};

export default nextConfig;
