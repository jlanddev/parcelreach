/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Never let the CRM HTML be cached by the CDN/browser, so a new deploy's code
  // loads immediately instead of serving a stale shell with old JS chunk refs.
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
