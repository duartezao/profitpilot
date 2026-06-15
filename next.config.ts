import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Oculta o ícone de dev (Turbopack/route indicator) no canto da página.
  devIndicators: false,
  // Pacotes nativos/server que não devem ser empacotados pelo bundler.
  serverExternalPackages: ["mongoose", "@node-rs/argon2"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
