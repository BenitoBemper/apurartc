import { NextResponse, type NextRequest } from "next/server";
import { autenticar, erro, resolverEmpresa } from "@/lib/api/base";
import { QueryDivergencias, mensagemZod } from "@/lib/api/esquemas";
import { num } from "@/lib/api/serializar";

export const runtime = "nodejs";
const POR_PAGINA = 100;

// GET /api/v1/divergencias?cnpj=&competencia=&tributo=&papel=&minimo=&pagina=
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req, "consultar");
  if (ctx instanceof NextResponse) return ctx;
  const q = QueryDivergencias.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return erro(400, "PARAMETRO_INVALIDO", mensagemZod(q.error));
  const empresa = await resolverEmpresa(ctx, q.data.cnpj);
  if (empresa instanceof NextResponse) return empresa;

  const de = (q.data.pagina - 1) * POR_PAGINA;
  let consulta = ctx.admin.from("vw_divergencias")
    .select("documento_id, importacao_id, chave_acesso, documento_numero, papel, item_numero, tributo, informado, calculado, diferenca", { count: "exact" })
    .eq("escritorio_id", ctx.chave.escritorioId).eq("empresa_id", empresa.id)
    .eq("competencia", `${q.data.competencia}-01`).gte("diferenca_abs", q.data.minimo);
  if (q.data.tributo) consulta = consulta.eq("tributo", q.data.tributo);
  if (q.data.papel) consulta = consulta.eq("papel", q.data.papel);
  const { data, count, error } = await consulta
    .order("diferenca_abs", { ascending: false }).order("documento_numero").order("item_numero")
    .range(de, de + POR_PAGINA - 1);
  if (error) return erro(500, "FALHA", error.message);

  return NextResponse.json({
    pagina: q.data.pagina,
    total: count ?? 0,
    itens: (data ?? []).map((l) => ({
      nota_id: l.documento_id, importacao_id: l.importacao_id, chave_acesso: l.chave_acesso, numero: l.documento_numero,
      papel: l.papel, item: l.item_numero, tributo: l.tributo,
      informado: num(l.informado), calculado: num(l.calculado), diferenca: num(l.diferenca),
    })),
  });
}
