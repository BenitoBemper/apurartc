import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacote do monorepo publicado como TypeScript.
  transpilePackages: ["@apurartc/db"],
};

export default nextConfig;
