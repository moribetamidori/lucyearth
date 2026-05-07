import type { NextConfig } from "next";

const s3PublicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL;
const s3PublicUrl = s3PublicBaseUrl ? new URL(s3PublicBaseUrl) : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: "https",
        hostname: "lucyearth.s3.us-east-1.amazonaws.com",
        pathname: "/storage/**",
      },
      ...(s3PublicUrl
        ? [
            {
              protocol: s3PublicUrl.protocol.replace(":", "") as "http" | "https",
              hostname: s3PublicUrl.hostname,
              pathname: "/storage/**",
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
