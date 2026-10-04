import type { NextConfig } from "next";

// BACKEND_URL is read at request time by the route handlers in app/api,
// so the same image can be pointed at any backend via the environment.
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
