import Link from "next/link";
import { FileSpreadsheet, FileText } from "lucide-react";
import { obterContexto } from "@/lib/contexto";
import { obterRelatorio, type Valores } from "@/lib/relatorio";
import { formatarCnpj, formatarCompetencia, formatarMoeda } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Relatório mensal · ApuraRTC" };

const TRIBUTOS: [keyof Valores, string][] = [["cbs", "CBS"], ["ibsUf", "IBS estadual"], ["ibsMun", "IBS municipal"], ["is", "Imposto Seletivo"]];

function Saldo({ v }: { v: number }) {
  return (
    <span className={cn("tabular-nums", v < 0 && "text-emerald-600 dark:text-emerald-400")}>
      {formatarMoeda(v)}{v < 0 ? " (credor)" : ""}
    </span>
  );
}

export default async function RelatorioPage() {
  const ctx = await obterContexto();
  if (!ctx.empresa) {
    return <p className="text-muted-foreground">Nenhuma empresa cadastrada. <Link className="underline" href="/empresas">Cadastre a primeira</Link>.</p>;
  }
  const d = await obterRelatorio(ctx.supabase, ctx.empresa, ctx.competencia);
  const r = d.resumo;
  const maxHist = Math.max(1, ...d.historico.map((m) => Math.abs(m.saldo.cbs + m.saldo.ibsUf + m.saldo.ibsMun)));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relatório mensal</h1>
          <p className="text-sm text-muted-foreground">
            {ctx.empresa.razao_social} · CNPJ {formatarCnpj(ctx.empresa.cnpj)} · competência {formatarCompetencia(ctx.competencia)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><a href="/relatorio/exportar?formato=xlsx"><FileSpreadsheet /> Excel</a></Button>
          <Button asChild variant="outline"><a href="/relatorio/exportar?formato=pdf"><FileText /> PDF</a></Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Débito × crédito</CardTitle>
          <CardDescription>Débito das notas emitidas menos crédito das notas recebidas, pelos valores da calculadora oficial. O Imposto Seletivo não gera crédito.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tributo</TableHead>
                <TableHead className="text-right">Débito (emitidas)</TableHead>
                <TableHead className="text-right">Crédito (recebidas)</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TRIBUTOS.map(([k, rot]) => (
                <TableRow key={k}>
                  <TableCell className="font-medium">{rot}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(r.debito[k])}</TableCell>
                  <TableCell className="text-right tabular-nums">{k === "is" ? "—" : formatarMoeda(r.credito[k])}</TableCell>
                  <TableCell className="text-right font-medium"><Saldo v={r.saldo[k]} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total IBS/CBS</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(r.debito.cbs + r.debito.ibsUf + r.debito.ibsMun)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatarMoeda(r.credito.cbs + r.credito.ibsUf + r.credito.ibsMun)}</TableCell>
                <TableCell className="text-right"><Saldo v={Math.round((r.saldo.cbs + r.saldo.ibsUf + r.saldo.ibsMun) * 100) / 100} /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Notas emitidas" valor={d.notas.emitidas} />
        <Numero rotulo="Notas recebidas" valor={d.notas.recebidas} />
        <Numero rotulo="Itens calculados" valor={`${r.qtdCalculados} de ${r.qtdItens}`} />
        <Numero rotulo="Divergências" valor={d.divergencias} href="/divergencias" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saldo IBS/CBS dos últimos 6 meses</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {d.historico.map((m) => {
            const total = Math.round((m.saldo.cbs + m.saldo.ibsUf + m.saldo.ibsMun) * 100) / 100;
            return (
              <div key={m.competencia} className="grid grid-cols-[70px_1fr_140px] items-center gap-3 text-sm">
                <span className={cn(m.competencia === ctx.competencia && "font-semibold")}>{formatarCompetencia(m.competencia)}</span>
                <div className="h-3 rounded bg-muted">
                  <div className={cn("h-3 rounded", total < 0 ? "bg-emerald-500" : "bg-primary")}
                    style={{ width: `${Math.round((Math.abs(total) / maxHist) * 100)}%` }} />
                </div>
                <span className="text-right"><Saldo v={total} /></span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Calculadora oficial: {d.versaoCalculadora ?? "—"}. Relatório gerencial; não substitui a apuração oficial da Receita Federal.
      </p>
    </div>
  );
}

function Numero({ rotulo, valor, href }: { rotulo: string; valor: number | string; href?: string }) {
  const conteudo = <div className="text-2xl font-semibold tabular-nums">{valor}</div>;
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{rotulo}</CardDescription></CardHeader>
      <CardContent>{href ? <Link href={href} className="hover:underline">{conteudo}</Link> : conteudo}</CardContent>
    </Card>
  );
}
