import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    outputFileTracingRoot: path.join(process.cwd(), "../"),
  },
};

export default nextConfig;
