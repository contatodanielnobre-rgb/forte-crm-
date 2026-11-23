import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "exceljs", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  // Criador de Conteúdo (creator/ → public/creator): rotas do app de página única caem no index.html
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: "/creator/:path*", destination: "/creator/index.html" }] };
  },
};
export default nextConfig;
