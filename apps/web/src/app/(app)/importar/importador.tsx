"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileJson, UploadCloud } from "lucide-react";
import { caminhoArquivo, BUCKET_ARQUIVOS, type Tabela } from "@apurartc/db";
import { criarClienteBrowser } from "@/lib/supabase/client";
import type { EmpresaResumo } from "@/lib/contexto";
import { formatarCnpj } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { nomeOriginal, statusImportacao } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Linha = Pick<
  Tabela<"importacoes">,
  "id" | "formato" | "arquivo_path" | "status" | "qtd_docs" | "qtd_erros" | "mensagem_erro" | "criado_em"
>;

const TAMANHO_MAX = 50 * 1024 * 1024;

async function sha256(arquivo: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function Importador(props: {
  escritorioId: string;
  empresa: EmpresaResumo;
  podeImportar: boolean;
  historicoInicial: Linha[];
}) {
  const { escritorioId, empresa, podeImportar } = props;
  const [linhas, setLinhas] = useState<Linha[]>(props.historicoInicial);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const supabase = useRef(criarClienteBrowser()).current;

  // Status em tempo real (Realtime respeita o RLS)
  useEffect(() => {
    const canal = supabase
      .channel(`importacoes-${empresa.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "importacoes", filter: `empresa_id=eq.${empresa.id}` },
        (p) => {
          const nova = p.new as Linha;
          if (!nova?.id) return;
          setLinhas((atual) => {
            const i = atual.findIndex((l) => l.id === nova.id);
            if (i === -1) return [nova, ...atual];
            const copia = [...atual];
            copia[i] = { ...copia[i], ...nova };
            return copia;
          });
          if (p.eventType === "UPDATE" && nova.status === "concluido") toast.success(`${nomeOriginal(nova.arquivo_path)}: concluído`);
          if (p.eventType === "UPDATE" && nova.status === "erro") toast.error(`${nomeOriginal(nova.arquivo_path)}: ${nova.mensagem_erro ?? "erro"}`);
        },
      );
    // O Realtime precisa do token do usuário para aplicar o RLS
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      canal.subscribe();
    });
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, empresa.id]);

  async function enviar(arquivos: FileList | File[]) {
    for (const arq of Array.from(arquivos)) {
      if (!/\.json$/i.test(arq.name)) {
        toast.error(`${arq.name}: só arquivos .json nesta versão (XML NF-e vem na próxima etapa).`);
        continue;
      }
      if (arq.size > TAMANHO_MAX) {
        toast.error(`${arq.name}: maior que 50 MB.`);
        continue;
      }
      setEnviando((n) => n + 1);
      try {
        const hash = await sha256(arq);
        const { count } = await supabase
          .from("importacoes")
          .select("id", { count: "exact", head: true })
          .eq("empresa_id", empresa.id)
          .eq("hash_sha256", hash);
        if (count) {
          toast.warning(`${arq.name}: este arquivo já foi importado para esta empresa.`);
          continue;
        }
        const nome = `${crypto.randomUUID()}__${arq.name.replace(/[^\w.\-]+/g, "_")}`;
        const path = caminhoArquivo(escritorioId, empresa.id, "importacoes", nome);
        const up = await supabase.storage.from(BUCKET_ARQUIVOS).upload(path, arq, { contentType: "application/json" });
        if (up.error) throw new Error(up.error.message);

        const { data, error } = await supabase
          .from("importacoes")
          .insert({ empresa_id: empresa.id, escritorio_id: escritorioId, formato: "json", arquivo_path: path, hash_sha256: hash })
          .select("id, formato, arquivo_path, status, qtd_docs, qtd_erros, mensagem_erro, criado_em")
          .single();
        if (error) {
          throw new Error(error.code === "23505" ? "este arquivo já foi importado para esta empresa" : error.message);
        }
        setLinhas((atual) => (atual.some((l) => l.id === data.id) ? atual : [data, ...atual]));
        toast.info(`${arq.name}: enviado para processamento.`);
      } catch (e) {
        toast.error(`${arq.name}: ${(e as Error).message}`);
      } finally {
        setEnviando((n) => n - 1);
      }
    }
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Importar</h1>

      {podeImportar && (
        <Card>
          <CardHeader>
            <CardTitle>Arquivos JSON</CardTitle>
            <CardDescription>
              Destino: <strong>{empresa.razao_social}</strong> ({formatarCnpj(empresa.cnpj)}). Layout: OperacaoInput da
              calculadora (uma nota ou uma lista), com os campos opcionais chaveAcesso, numero, serie e informado por item.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); void enviar(e.dataTransfer.files); }}
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-muted-foreground transition-colors",
                arrastando ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <UploadCloud className="size-8" />
              <span className="font-medium text-foreground">
                {enviando ? `Enviando ${enviando} arquivo(s)…` : "Arraste arquivos aqui ou clique para escolher"}
              </span>
              <span className="text-xs">.json · até 50 MB · até 5 mil notas por mês no plano gratuito</span>
            </button>
            <input ref={input} type="file" accept=".json,application/json" multiple hidden
              onChange={(e) => { if (e.target.files) void enviar(e.target.files); e.target.value = ""; }} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
        <CardContent>
          {linhas.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Notas</TableHead>
                  <TableHead className="text-right">Itens com erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => {
                  const s = statusImportacao(l.status);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-72">
                        <div className="flex items-center gap-2 truncate"><FileJson className="size-4 shrink-0" />{nomeOriginal(l.arquivo_path)}</div>
                        {l.status === "erro" && l.mensagem_erro && (
                          <div className="mt-1 whitespace-normal text-xs text-destructive">{l.mensagem_erro}</div>
                        )}
                      </TableCell>
                      <TableCell>{new Date(l.criado_em).toLocaleString("pt-BR")}</TableCell>
                      <TableCell><Badge variant={s.variante}>{s.rotulo}</Badge></TableCell>
                      <TableCell className="text-right">{l.qtd_docs}</TableCell>
                      <TableCell className="text-right">{l.qtd_erros}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-muted-foreground">Nenhuma importação ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
