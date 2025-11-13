/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  // Ensure sharp works correctly on Vercel
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;


