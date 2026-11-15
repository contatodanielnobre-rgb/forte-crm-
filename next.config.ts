import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "exceljs", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};
export default nextConfig;
