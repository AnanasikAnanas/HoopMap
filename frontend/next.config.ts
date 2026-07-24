import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : "";
  } catch {
    return "";
  }
})();
const mediaHost = process.env.NEXT_PUBLIC_MEDIA_HOST?.trim() || supabaseHost;
if (mediaHost && !/^[a-z0-9.-]+$/i.test(mediaHost)) {
  throw new Error("NEXT_PUBLIC_MEDIA_HOST must be a hostname without a protocol or path");
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: process.cwd() },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "minio" },
      ...(mediaHost ? [{ protocol: "https" as const, hostname: mediaHost }] : []),
    ],
  },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()",
      },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
