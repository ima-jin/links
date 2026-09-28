const { tier2Headers, tier3Headers } = require('@ima-jin/config/next-headers');
const { buildPublicUrlAbsolute } = require('@ima-jin/config');

// Mirrors ima-jin/dykil: this fork is mounted behind a reverse-proxy path
// prefix (/links) rather than a bare root — see .env.example and
// docs/ARCHITECTURE.md.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.imajin.ai',
      },
    ],
  },
  async headers() {
    return [
      // Tier 2 + Tier 3 on every route — this app is embedded by the kernel's
      // auth hub, same as it was in the monorepo.
      { source: '/:path*', headers: [...tier2Headers(), ...tier3Headers()] },
    ];
  },
  async redirects() {
    // Standalone `/dashboard` -> hub tab redirect (#2332), ported from the
    // in-monorepo apps/links `middleware.ts`. Implemented here (evaluated in
    // the Node.js server context) rather than as Edge middleware: this app's
    // `instrumentation.ts` needs `@ima-jin/auth-client`'s Node-only signing-key
    // boot path (crypto/fs/path), which Next.js cannot bundle for the Edge
    // runtime an `export function middleware()` would additionally require.
    // Query parameters are preserved automatically; the `missing` clause
    // excludes the hub's own embedded iframe load (`?embed=hub&did=...`).
    return [
      {
        source: '/dashboard',
        missing: [{ type: 'query', key: 'embed' }],
        destination: `${buildPublicUrlAbsolute('kernel')}/auth/links`,
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
