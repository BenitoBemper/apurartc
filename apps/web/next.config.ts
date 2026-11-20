import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacote do monorepo publicado como TypeScript.
  transpilePackages: ["@apurartc/db"],
  // pdfkit lê as fontes (.afm) do disco e o exceljs é pesado: ficam fora do bundle do servidor.
  serverExternalPackages: ["pdfkit", "exceljs"],
};

export default nextConfig;
