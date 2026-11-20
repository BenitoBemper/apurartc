import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { BUCKET_ARQUIVOS } from "@apurartc/db";
import { obterContexto } from "@/lib/contexto";
import { formatarCompetencia, formatarMoeda } from "@/lib/formatos";
import { ESTADO_ITEM, PAPEL, TRIBUTOS, nomeOriginal, statusImportacao } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Importação · ApuraRTC" };

const POR_PAGINA = 20;
const FORMATOS: Record<string, string> = { json: "JSON", xml_nfe: "XML NF-e/NFC-e", zip: "ZIP de XMLs", xml_nfse: "XML NFS-e", txt: "TXT" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> };

export default async function DetalheImportacaoPage({ params, searchParams }: Props) {
  const { id } = await params;
  const pagina = Math.max(1, Number((await searchParams).pagina) || 1);
  const { supabase } = await obterContexto();

  const { data: imp } = await supabase
    .from("importacoes")
    .select("id, escritorio_id, empresa_id, formato, arquivo_path, status, qtd_docs, qtd_erros, mensagem_erro, criado_em, concluido_em, empresas(razao_social)")
    .eq("id", id)
    .maybeSingle();
  if (!imp) notFound();

  const de = (pagina - 1) * POR_PAGINA;
  const [docs, ocorrencias, urlOriginal, urlRoc] = await Promise.all([
    supabase.from("documentos")
      .select("id, tipo_dfe, chave_acesso, numero, serie, papel, competencia, arquivo_origem", { count: "exact" })
      .eq("importacao_id", id).order("papel").order("numero").range(de, de + POR_PAGINA - 1),
    supabase.from("erros_validacao")
      .select("id, codigo, campo, mensagem, arquivo_origem, item_numero, documento_id")
      .eq("importacao_id", id).order("arquivo_origem", { nullsFirst: true }).order("item_numero").limit(500),
    supabase.storage.from(BUCKET_ARQUIVOS).createSignedUrl(imp.arquivo_path, 300, { download: nomeOriginal(imp.arquivo_path) }),
    imp.status === "concluido"
      ? supabase.storage.from(BUCKET_ARQUIVOS).createSignedUrl(`${imp.escritorio_id}/${imp.empresa_id}/roc/${imp.id}.json`, 300, {
          download: `resultado-${nomeOriginal(imp.arquivo_path).replace(/\.\w+$/, "")}.json`,
        })
      : Promise.resolve({ data: null }),
  ]);

  const docIds = (docs.data ?? []).map((d) => d.id);
  const { data: linhas } = docIds.length
    ? await supabase.from("vw_divergencias")
        .select("documento_id, item_numero, ncm, nbs, cclasstrib, estado_item, tributo, informado, calculado, diferenca")
        .in("documento_id", docIds).order("item_numero")
    : { data: [] };

  // documento → item → tributo
  type Item = { numero: number; codigo: string; cclasstrib: string | null; estado: string | null; t: Record<string, { inf: number | null; calc: number | null; dif: number | null }> };
  const itensPorDoc = new Map<string, Map<number, Item>>();
  for (const l of linhas ?? []) {
    const porItem = itensPorDoc.get(l.documento_id!) ?? new Map<number, Item>();
    const it = porItem.get(l.item_numero!) ?? {
      numero: l.item_numero!, codigo: l.ncm ?? l.nbs ?? "—", cclasstrib: l.cclasstrib, estado: l.estado_item, t: {},
    };
    it.t[l.tributo!] = { inf: l.informado, calc: l.calculado, dif: l.diferenca };
    porItem.set(l.item_numero!, it);
    itensPorDoc.set(l.documento_id!, porItem);
  }
  const errosPorDocItem = new Map<string, string[]>();
  for (const o of ocorrencias.data ?? []) {
    if (!o.documento_id) continue;
    const k = `${o.documento_id}#${o.item_numero}`;
    errosPorDocItem.set(k, [...(errosPorDocItem.get(k) ?? []), `${o.codigo}: ${o.mensagem}`]);
  }
  const geral = (ocorrencias.data ?? []).filter((o) => !o.documento_id);
  const s = statusImportacao(imp.status);
  const totalDocs = docs.count ?? 0;
  const paginas = Math.max(1, Math.ceil(totalDocs / POR_PAGINA));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/importar" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="size-4" /> Importações
          </Link>
          <h1 className="text-2xl font-semibold break-all">{nomeOriginal(imp.arquivo_path)}</h1>
        </div>
        <div className="flex gap-2">
          {urlOriginal.data?.signedUrl && (
            <Button asChild variant="outline"><a href={urlOriginal.data.signedUrl}><Download /> Arquivo original</a></Button>
          )}
          {urlRoc.data?.signedUrl && (
            <Button asChild><a href={urlRoc.data.signedUrl}><Download /> Resultado completo (ROC)</a></Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Info rotulo="Status"><Badge variant={s.variante}>{s.rotulo}</Badge></Info>
          <Info rotulo="Empresa">{imp.empresas?.razao_social ?? "—"}</Info>
          <Info rotulo="Formato">{FORMATOS[imp.formato] ?? imp.formato}</Info>
          <Info rotulo="Enviado em">{new Date(imp.criado_em).toLocaleString("pt-BR")}</Info>
          <Info rotulo="Notas calculadas">{imp.qtd_docs}</Info>
          <Info rotulo="Erros">{imp.qtd_erros}</Info>
          {imp.mensagem_erro && <p className="text-sm text-destructive sm:col-span-3 lg:col-span-6">{imp.mensagem_erro}</p>}
        </CardContent>
      </Card>

      {geral.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ocorrências do arquivo</CardTitle>
            <CardDescription>Notas que não foram calculadas e avisos (eventos ignorados, notas repetidas).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Tipo</TableHead><TableHead>Arquivo</TableHead><TableHead>Campo</TableHead><TableHead>Mensagem</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {geral.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell><Badge variant={o.codigo === "AVISO" ? "secondary" : "destructive"}>{o.codigo}</Badge></TableCell>
                    <TableCell className="text-sm">{o.arquivo_origem ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{o.campo ?? "—"}</TableCell>
                    <TableCell className="max-w-xl whitespace-normal text-sm">{o.mensagem}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {(docs.data ?? []).map((d) => {
        const itens = [...(itensPorDoc.get(d.id)?.values() ?? [])];
        const comErro = [...errosPorDocItem.keys()].filter((k) => k.startsWith(d.id)).map((k) => Number(k.split("#")[1]));
        for (const n of comErro) if (!itens.some((i) => i.numero === n)) itens.push({ numero: n, codigo: "—", cclasstrib: null, estado: "INCONSISTENCIA_ENTRADA", t: {} });
        itens.sort((a, b) => a.numero - b.numero);
        return (
          <Card key={d.id} id={`doc-${d.id}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {d.tipo_dfe === "NFCE" ? "NFC-e" : d.tipo_dfe === "NFE" ? "NF-e" : "Operação"} {d.numero ?? ""}
                {d.serie && <span className="font-normal text-muted-foreground">série {d.serie}</span>}
                <Badge variant="outline">{PAPEL[d.papel]}</Badge>
                <span className="text-sm font-normal text-muted-foreground">{d.competencia ? `competência ${formatarCompetencia(d.competencia)}` : ""}</span>
              </CardTitle>
              <CardDescription className="font-mono text-xs break-all">
                {d.chave_acesso ?? "sem chave de acesso"}{d.arquivo_origem ? ` · ${d.arquivo_origem}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>NCM/NBS · cClassTrib</TableHead>
                    <TableHead>Situação</TableHead>
                    {TRIBUTOS.map((t) => <TableHead key={t.id} className="text-right">{t.rotulo}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((it) => {
                    const e = ESTADO_ITEM[it.estado ?? ""] ?? { rotulo: it.estado ?? "—", erro: true };
                    const erros = errosPorDocItem.get(`${d.id}#${it.numero}`);
                    return (
                      <TableRow key={it.numero} className="align-top">
                        <TableCell>{it.numero}</TableCell>
                        <TableCell className="font-mono text-xs">{it.codigo}{it.cclasstrib ? ` · ${it.cclasstrib}` : ""}</TableCell>
                        <TableCell className="max-w-64 whitespace-normal">
                          <Badge variant={e.erro ? "destructive" : "secondary"}>{e.rotulo}</Badge>
                          {erros?.map((m) => <div key={m} className="mt-1 text-xs text-destructive">{m}</div>)}
                        </TableCell>
                        {TRIBUTOS.map((t) => <ValorTributo key={t.id} v={it.t[t.id]} />)}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      {totalDocs === 0 && imp.status !== "erro" && (
        <p className="text-muted-foreground">Nenhuma nota calculada ainda. Esta página mostra o resultado quando o processamento termina.</p>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {pagina > 1 && <Link className="underline" href={`?pagina=${pagina - 1}`}>Anterior</Link>}
          <span>Página {pagina} de {paginas} · {totalDocs} notas</span>
          {pagina < paginas && <Link className="underline" href={`?pagina=${pagina + 1}`}>Próxima</Link>}
        </div>
      )}
    </div>
  );
}

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

/** Calculado (grande) e, quando o ERP informou, o informado e a diferença. */
function ValorTributo({ v }: { v?: { inf: number | null; calc: number | null; dif: number | null } }) {
  if (!v) return <TableCell className="text-right text-muted-foreground">—</TableCell>;
  const diverge = v.dif !== null && Math.abs(Number(v.dif)) > 0.01;
  return (
    <TableCell className="text-right tabular-nums">
      <div>{v.calc === null ? "—" : formatarMoeda(v.calc)}</div>
      {v.inf !== null && (
        <div className={cn("text-xs", diverge ? "font-medium text-destructive" : "text-muted-foreground")}>
          ERP {formatarMoeda(v.inf)}{diverge ? ` (${Number(v.dif) > 0 ? "+" : ""}${formatarMoeda(v.dif)})` : ""}
        </div>
      )}
    </TableCell>
  );
}
