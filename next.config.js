/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nothing here is meant to be framed by another site -- closes
          // off clickjacking regardless of what any individual page does.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Stops a browser from ever executing/rendering a response as a
          // different content type than what we declared (relevant for
          // user-uploaded files served back through this origin).
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
