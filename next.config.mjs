/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hide the floating Next.js badge in development.
  devIndicators: false,
  // Keep the admin out of search engines. The header also covers files the noindex meta tag
  // in pages/_document.jsx can't, such as images and scripts.
  headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ];
  },
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
