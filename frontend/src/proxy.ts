import { type NextRequest, NextResponse } from "next/server";

function configuredOrigins(): string[] {
  const values = [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
      "https://tiles.openfreemap.org/styles/liberty",
    ...(process.env.CSP_CONNECT_SRC ?? "").split(/[\s,]+/),
  ];
  return Array.from(
    new Set(
      values.flatMap((value) => {
        if (!value) return [];
        try {
          const url = new URL(value);
          return url.protocol === "https:" ? [url.origin] : [];
        } catch {
          return [];
        }
      }),
    ),
  );
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const externalOrigins = configuredOrigins().join(" ");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://telegram.org${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' blob: data: ${externalOrigins}${isDevelopment ? " https: http:" : ""}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${externalOrigins}${isDevelopment ? " https: http: wss: ws:" : ""}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
