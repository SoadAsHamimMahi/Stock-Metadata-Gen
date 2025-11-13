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
  // Handle font loading failures gracefully
  optimizeFonts: true,
};

export default nextConfig;


