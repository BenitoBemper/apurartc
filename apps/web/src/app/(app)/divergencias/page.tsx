import Link from "next/link";
import { obterContexto } from "@/lib/contexto";
import { formatarCompetencia, formatarMoeda } from "@/lib/formatos";
import { PAPEL, TRIBUTOS } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Divergências · ApuraRTC" };

const POR_PAGINA = 50;
const ROTULO_TRIBUTO: Record<string, string> = Object.fromEntries(TRIBUTOS.map((t) => [t.id, t.rotulo]));

type Filtros = { tributo?: string; papel?: string; minimo?: string; pagina?: string };

const seletor = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

export default async function DivergenciasPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const f = await searchParams;
  const ctx = await obterContexto();
  if (!ctx.empresa) return <p className="text-muted-foreground">Cadastre uma empresa primeiro.</p>;

  const tributo = TRIBUTOS.some((t) => t.id === f.tributo) ? f.tributo! : "";
  const papel = f.papel === "emitida" || f.papel === "recebida" ? f.papel : "";
  const minimo = Math.max(0.01, Number(String(f.minimo ?? "").replace(",", ".")) || 0.01);
  const pagina = Math.max(1, Number(f.pagina) || 1);
  const de = (pagina - 1) * POR_PAGINA;

  let q = ctx.supabase
    .from("vw_divergencias")
    .select("documento_id, importacao_id, documento_numero, chave_acesso, papel, item_numero, ncm, nbs, cclasstrib, tributo, informado, calculado, diferenca", { count: "exact" })
    .eq("empresa_id", ctx.empresa.id)
    .eq("competencia", `${ctx.competencia}-01`)
    .gte("diferenca_abs", minimo);
  if (tributo) q = q.eq("tributo", tributo);
  if (papel) q = q.eq("papel", papel as "emitida" | "recebida");
  const { data: linhas, count, error } = await q
    .order("diferenca_abs", { ascending: false })
    .order("documento_numero")
    .order("item_numero")
    .range(de, de + POR_PAGINA - 1);

  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (p: number) =>
    "?" + new URLSearchParams({ ...(tributo && { tributo }), ...(papel && { papel }), minimo: String(minimo), pagina: String(p) }).toString();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Divergências</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.empresa.razao_social} · competência {formatarCompetencia(ctx.competencia)} · valor destacado pelo ERP × valor calculado pela calculadora oficial
        </p>
      </div>

      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tributo">Tributo</Label>
              <select id="tributo" name="tributo" defaultValue={tributo} className={seletor}>
                <option value="">Todos</option>
                {TRIBUTOS.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="papel">Notas</Label>
              <select id="papel" name="papel" defaultValue={papel} className={seletor}>
                <option value="">Emitidas e recebidas</option>
                <option value="emitida">{PAPEL.emitida}</option>
                <option value="recebida">{PAPEL.recebida}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="minimo">Diferença mínima (R$)</Label>
              <Input id="minimo" name="minimo" inputMode="decimal" defaultValue={minimo.toFixed(2)} className="w-36" />
            </div>
            <Button type="submit">Filtrar</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{total} divergência(s)</CardTitle>
          <CardDescription>Ordenadas pela maior diferença. Diferença = calculado − informado (positiva: o ERP destacou a menos).</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive">Erro ao consultar: {error.message}</p>
          ) : linhas?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nota</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>NCM/NBS · cClassTrib</TableHead>
                  <TableHead>Tributo</TableHead>
                  <TableHead className="text-right">Informado (ERP)</TableHead>
                  <TableHead className="text-right">Calculado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={`${l.documento_id}-${l.item_numero}-${l.tributo}`}>
                    <TableCell>
                      <Link className="hover:underline" href={`/importacoes/${l.importacao_id}#doc-${l.documento_id}`}>
                        {l.documento_numero ?? "—"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{l.papel ? PAPEL[l.papel] : ""}</div>
                    </TableCell>
                    <TableCell>{l.item_numero}</TableCell>
                    <TableCell className="font-mono text-xs">{l.ncm ?? l.nbs ?? "—"} · {l.cclasstrib ?? "—"}</TableCell>
                    <TableCell>{ROTULO_TRIBUTO[l.tributo ?? ""] ?? l.tributo}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(l.informado)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.calculado === null ? "—" : formatarMoeda(l.calculado)}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${Number(l.diferenca) > 0 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>
                      {Number(l.diferenca) > 0 ? "+" : ""}{formatarMoeda(l.diferenca)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-muted-foreground">Nenhuma divergência com esses filtros.</p>
          )}

          {paginas > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              {pagina > 1 && <Link className="underline" href={link(pagina - 1)}>Anterior</Link>}
              <span>Página {pagina} de {paginas}</span>
              {pagina < paginas && <Link className="underline" href={link(pagina + 1)}>Próxima</Link>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
