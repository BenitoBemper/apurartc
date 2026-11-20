import { NextResponse, type NextRequest } from "next/server";
import { autenticar, erro } from "@/lib/api/base";
import { PathId } from "@/lib/api/esquemas";
import { serializarImportacao } from "@/lib/api/serializar";

export const runtime = "nodejs";

// GET /api/v1/importacoes/{id}
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await autenticar(req, "consultar");
  if (ctx instanceof NextResponse) return ctx;
  const p = PathId.safeParse(await params);
  if (!p.success) return erro(404, "NAO_ENCONTRADO", "Importação não encontrada.");

  let q = ctx.admin.from("importacoes")
    .select("id, empresa_id, formato, status, qtd_docs, qtd_erros, mensagem_erro, criado_em, concluido_em, empresas(cnpj)")
    .eq("id", p.data.id).eq("escritorio_id", ctx.chave.escritorioId);
  if (ctx.chave.empresaId) q = q.eq("empresa_id", ctx.chave.empresaId);
  const { data: imp } = await q.maybeSingle();
  if (!imp) return erro(404, "NAO_ENCONTRADO", "Importação não encontrada.");

  const { data: ocorr } = await ctx.admin.from("erros_validacao")
    .select("codigo, campo, mensagem, arquivo_origem, documento_id, item_numero")
    .eq("importacao_id", imp.id).eq("escritorio_id", ctx.chave.escritorioId).order("criado_em").limit(1000);
  return NextResponse.json(serializarImportacao(imp, imp.empresas?.cnpj ?? "", ocorr ?? []));
}
