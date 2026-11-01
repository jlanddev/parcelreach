/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Bundle the change log so the admin-only /api/changelog route can read it at runtime.
  outputFileTracingIncludes: {
    '/api/changelog': ['./docs/CHANGELOG-tracking.md'],
  },
}

module.exports = nextConfig
