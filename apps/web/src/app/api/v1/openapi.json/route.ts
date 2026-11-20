import { NextResponse, type NextRequest } from "next/server";
import { especificacaoOpenApi } from "@/lib/api/esquemas";

// Especificação OpenAPI 3.1 (pública), gerada dos mesmos esquemas que validam as requisições.
export function GET(req: NextRequest) {
  return NextResponse.json(especificacaoOpenApi(req.nextUrl.origin));
}
