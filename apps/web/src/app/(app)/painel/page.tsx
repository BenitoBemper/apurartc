import Link from "next/link";
import { obterContexto } from "@/lib/contexto";
import { formatarCompetencia, formatarMoeda } from "@/lib/formatos";
import { nomeOriginal, statusImportacao } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Painel · ApuraRTC" };

const LIMITE_MVP = 5000;

export default async function PainelPage() {
  const ctx = await obterContexto();
  if (!ctx.empresa) {
    return (
      <p className="text-muted-foreground">
        Nenhuma empresa cadastrada. <Link className="underline" href="/empresas">Cadastre a primeira</Link>.
      </p>
    );
  }
  const comp = `${ctx.competencia}-01`;
  const { supabase } = ctx;

  const [totais, divergencias, uso, ultimas] = await Promise.all([
    supabase.from("vw_totais_mensais").select("*").eq("empresa_id", ctx.empresa.id).eq("competencia", comp).maybeSingle(),
    supabase.from("vw_divergencias").select("item_id", { count: "exact", head: true })
      .eq("empresa_id", ctx.empresa.id).eq("competencia", comp).or("diferenca.gt.0.01,diferenca.lt.-0.01"),
    supabase.from("uso_mensal").select("qtd_notas").eq("escritorio_id", ctx.escritorio.id).eq("competencia", comp).maybeSingle(),
    supabase.from("importacoes").select("id, arquivo_path, status, qtd_docs, criado_em")
      .eq("empresa_id", ctx.empresa.id).order("criado_em", { ascending: false }).limit(5),
  ]);

  const t = totais.data;
  const qtdItens = t?.qtd_itens ?? 0;
  const qtdCalculados = t?.qtd_calculados ?? 0;
  const notas = uso.data?.qtd_notas ?? 0;
  const pctUso = Math.min(100, Math.round((notas / LIMITE_MVP) * 100));

  const cartoes = [
    { rotulo: "CBS", valor: t?.cbs_total },
    { rotulo: "IBS estadual", valor: t?.ibs_uf_total },
    { rotulo: "IBS municipal", valor: t?.ibs_mun_total },
    { rotulo: "Imposto Seletivo", valor: t?.is_total },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Painel</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.empresa.razao_social} · competência {formatarCompetencia(ctx.competencia)} · valores calculados pela calculadora oficial
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cartoes.map((c) => (
          <Card key={c.rotulo}>
            <CardHeader className="pb-2"><CardDescription>{c.rotulo}</CardDescription></CardHeader>
            <CardContent><div className="text-2xl font-semibold tabular-nums">{formatarMoeda(c.valor)}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Itens calculados</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{qtdCalculados} <span className="text-base font-normal text-muted-foreground">de {qtdItens}</span></div>
            {qtdItens > qtdCalculados && (
              <p className="mt-1 text-sm text-destructive">{qtdItens - qtdCalculados} item(ns) com erro de validação</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Divergências (ERP × calculadora)</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{divergencias.count ?? 0}</div>
            <p className="mt-1 text-sm text-muted-foreground">item × tributo com diferença acima de R$ 0,01</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Uso do plano gratuito (escritório)</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{notas.toLocaleString("pt-BR")} <span className="text-base font-normal text-muted-foreground">de {LIMITE_MVP.toLocaleString("pt-BR")} notas</span></div>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div className={`h-2 rounded-full ${pctUso >= 70 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pctUso}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas importações</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {ultimas.data?.length ? (
            ultimas.data.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate">{nomeOriginal(i.arquivo_path)}</span>
                <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                  {i.qtd_docs} nota(s) · {new Date(i.criado_em).toLocaleDateString("pt-BR")}
                  <Badge variant={statusImportacao(i.status).variante}>{statusImportacao(i.status).rotulo}</Badge>
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">Nenhuma importação. <Link className="underline" href="/importar">Importar arquivos</Link>.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
