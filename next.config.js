/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16+ Turbopack walks up for lockfiles; a package-lock.json in a parent folder
  // (e.g. the user home directory) makes it infer the wrong workspace root. That breaks
  // dev routing so /api/* can return 404 even though route files exist.
  turbopack: {
    root: __dirname,
  },
  // Allow the Google Fonts domain for font loading
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "image.pollinations.ai" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Typo safety: URL uses hyphens; callers might use underscore
      {
        source: "/api/game/killer_sudoku",
        destination: "/api/game/killer-sudoku",
      },
    ];
  },
};

module.exports = nextConfig;
