import { NextResponse, type NextRequest } from "next/server";
import { autenticar, erro } from "@/lib/api/base";
import { PathId, QueryResultado, mensagemZod } from "@/lib/api/esquemas";
import { num } from "@/lib/api/serializar";

export const runtime = "nodejs";
const POR_PAGINA = 100;

// GET /api/v1/importacoes/{id}/resultado?pagina=
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await autenticar(req, "consultar");
  if (ctx instanceof NextResponse) return ctx;
  const p = PathId.safeParse(await params);
  if (!p.success) return erro(404, "NAO_ENCONTRADO", "Importação não encontrada.");
  const q = QueryResultado.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return erro(400, "PARAMETRO_INVALIDO", mensagemZod(q.error));

  let iq = ctx.admin.from("importacoes").select("id").eq("id", p.data.id).eq("escritorio_id", ctx.chave.escritorioId);
  if (ctx.chave.empresaId) iq = iq.eq("empresa_id", ctx.chave.empresaId);
  const { data: imp } = await iq.maybeSingle();
  if (!imp) return erro(404, "NAO_ENCONTRADO", "Importação não encontrada.");

  const de = (q.data.pagina - 1) * POR_PAGINA;
  const { data: docs, count } = await ctx.admin.from("documentos")
    .select("id, chave_acesso, numero, papel, competencia", { count: "exact" })
    .eq("importacao_id", imp.id).eq("escritorio_id", ctx.chave.escritorioId)
    .order("papel").order("numero").range(de, de + POR_PAGINA - 1);

  const ids = (docs ?? []).map((d) => d.id);
  const { data: linhas } = ids.length
    ? await ctx.admin.from("vw_divergencias")
        .select("documento_id, item_numero, ncm, nbs, cclasstrib, estado_item, tributo, informado, calculado, diferenca")
        .eq("escritorio_id", ctx.chave.escritorioId).in("documento_id", ids).order("item_numero").limit(50_000)
    : { data: [] };

  type Item = { numero: number; ncm: string | null; nbs: string | null; cclasstrib: string | null; estado: string; tributos: Record<string, unknown> };
  const porDoc = new Map<string, Map<number, Item>>();
  for (const l of linhas ?? []) {
    const itens = porDoc.get(l.documento_id!) ?? new Map<number, Item>();
    const it = itens.get(l.item_numero!) ?? { numero: l.item_numero!, ncm: l.ncm, nbs: l.nbs, cclasstrib: l.cclasstrib, estado: l.estado_item ?? "", tributos: {} };
    it.tributos[l.tributo!] = { informado: num(l.informado), calculado: num(l.calculado), diferenca: num(l.diferenca) };
    itens.set(l.item_numero!, it);
    porDoc.set(l.documento_id!, itens);
  }

  return NextResponse.json({
    importacao_id: imp.id,
    pagina: q.data.pagina,
    total_notas: count ?? 0,
    notas: (docs ?? []).map((d) => ({
      id: d.id, chave_acesso: d.chave_acesso, numero: d.numero, papel: d.papel, competencia: (d.competencia ?? "").slice(0, 7),
      itens: [...(porDoc.get(d.id)?.values() ?? [])],
    })),
  });
}
