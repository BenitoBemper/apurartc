// Download do relatório mensal (Excel ou PDF) da empresa/competência selecionadas no topo. Usa a sessão do usuário (RLS).
import { NextResponse, type NextRequest } from "next/server";
import { obterContexto } from "@/lib/contexto";
import { obterRelatorio } from "@/lib/relatorio";
import { gerarExcel, gerarPdf, obterItens } from "@/lib/exportar";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await obterContexto();
  if (!ctx.empresa) return NextResponse.json({ erro: "nenhuma empresa selecionada" }, { status: 400 });
  const formato = req.nextUrl.searchParams.get("formato");
  const dados = await obterRelatorio(ctx.supabase, ctx.empresa, ctx.competencia);
  const nome = `apurartc-${ctx.empresa.cnpj}-${ctx.competencia}`;

  if (formato === "xlsx") {
    const corpo = await gerarExcel(dados, await obterItens(ctx.supabase, ctx.empresa.id, ctx.competencia));
    return new NextResponse(new Uint8Array(corpo), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nome}.xlsx"`,
      },
    });
  }
  if (formato === "pdf") {
    const corpo = await gerarPdf(dados);
    return new NextResponse(new Uint8Array(corpo), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}.pdf"` },
    });
  }
  return NextResponse.json({ erro: "formato deve ser xlsx ou pdf" }, { status: 400 });
}
