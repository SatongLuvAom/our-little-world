import type { NextConfig } from "next";
const development = process.env.NODE_ENV === "development";
const config: NextConfig = {
  output: development ? undefined : "export",
  poweredByHeader: false,
  devIndicators: false,
  ...(development
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:3019/api/:path*",
            },
          ];
        },
        async redirects() {
          return ["/login", "/register", "/account", "/pairing"].map(
            (source) => ({
              source,
              has: [{ type: "host" as const, value: "127.0.0.1" }],
              destination: "http://localhost:3017" + source,
              permanent: false,
            }),
          );
        },
      }
    : {}),
};
export default config;
