/** @type {import('next').NextConfig} */
import path from "path";

const nextConfig = {
  experimental: {
    outputFileTracingRoot: path.join(process.cwd(), "../"),
  },
};

export default nextConfig;
