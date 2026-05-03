/** @type {import('next').NextConfig} */
const apiProxyTarget = process.env.NEXT_SERVER_API_PROXY_TARGET ?? 'http://backend:8000';

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `${apiProxyTarget}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
