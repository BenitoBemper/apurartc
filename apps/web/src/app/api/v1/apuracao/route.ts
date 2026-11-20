import { NextResponse, type NextRequest } from "next/server";
import { autenticar, erro, resolverEmpresa } from "@/lib/api/base";
import { QueryApuracao, mensagemZod } from "@/lib/api/esquemas";
import { obterRelatorio, type Valores } from "@/lib/relatorio";

export const runtime = "nodejs";

const v = (x: Valores) => ({ cbs: x.cbs, ibs_uf: x.ibsUf, ibs_mun: x.ibsMun, is: x.is });

// GET /api/v1/apuracao?cnpj=&competencia=AAAA-MM
export async function GET(req: NextRequest) {
  const ctx = await autenticar(req, "consultar");
  if (ctx instanceof NextResponse) return ctx;
  const q = QueryApuracao.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return erro(400, "PARAMETRO_INVALIDO", mensagemZod(q.error));
  const empresa = await resolverEmpresa(ctx, q.data.cnpj);
  if (empresa instanceof NextResponse) return empresa;

  // obterRelatorio filtra tudo por empresa_id (a empresa já foi validada contra o escritório da chave)
  const d = await obterRelatorio(ctx.admin, empresa, q.data.competencia);
  return NextResponse.json({
    cnpj: empresa.cnpj,
    competencia: q.data.competencia,
    debito: v(d.resumo.debito),
    credito: v(d.resumo.credito),
    saldo: v(d.resumo.saldo),
    notas: d.notas,
    itens: { total: d.resumo.qtdItens, calculados: d.resumo.qtdCalculados },
    divergencias: d.divergencias,
    calculadora: d.versaoCalculadora,
  });
}
