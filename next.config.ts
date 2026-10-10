import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/admin": ["./public/images/*.{png,jpg,jpeg,webp,gif}"],
    "/api/orders": ["./public/images/*.{png,jpg,jpeg,webp,gif}"],
    "/api/jobs/email": ["./public/images/*.{png,jpg,jpeg,webp,gif}"],
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/admin.html", destination: "/admin", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
