import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Serveur autonome (.next/standalone) : c'est ce que copie l'image Docker (infrastructure/docker).
  output: 'standalone',
  transpilePackages: ['@rekonect/brand', '@rekonect/ui', '@rekonect/api-client'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Back-office interne : jamais indexé.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
