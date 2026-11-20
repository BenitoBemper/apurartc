"use client";
import { startTransition, useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { criarChave, revogarChave, type Estado } from "./acoes";
import type { EmpresaResumo } from "@/lib/contexto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Chave = {
  id: string; nome: string; prefixo: string; escopos: string[]; empresa_id: string | null;
  ultimo_uso: string | null; revogada_em: string | null; criado_em: string;
};
const seletor = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";
const data = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "nunca");

export function ChavesApi({ chaves, empresas }: { chaves: Chave[]; empresas: EmpresaResumo[] }) {
  const [estado, acao, pendente] = useActionState<Estado, FormData>(criarChave, {});
  const [revogando, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const nomeEmpresa = (id: string | null) => (id ? empresas.find((e) => e.id === id)?.razao_social ?? "—" : "Todas");

  useEffect(() => {
    if (estado.erro) toast.error(estado.erro);
    if (estado.chave) form.current?.reset();
  }, [estado]);

  return (
    <div className="grid gap-6">
      <form ref={form} className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
        onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); startTransition(() => acao(d)); }}>
        <div className="grid gap-2">
          <Label htmlFor="nome-chave">Nome</Label>
          <Input id="nome-chave" name="nome" required maxLength={60} placeholder="ERP da matriz" className="w-56" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="empresa-chave">Empresa</Label>
          <select id="empresa-chave" name="empresa" defaultValue="" className={seletor}>
            <option value="">Todas do escritório</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.razao_social}</option>)}
          </select>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Escopos</legend>
          <div className="flex h-9 items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" name="escopos" value="importar" defaultChecked /> Importar</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" name="escopos" value="consultar" defaultChecked /> Consultar</label>
          </div>
        </fieldset>
        <Button type="submit" disabled={pendente}>{pendente ? "Gerando…" : "Gerar chave"}</Button>
      </form>

      {estado.chave && (
        <div className="grid gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4" role="alert">
          <div className="text-sm font-medium">{estado.ok}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono text-sm" data-chave>{estado.chave}</code>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(estado.chave!).then(() => toast.success("Copiada."))}>
              <Copy /> Copiar
            </Button>
          </div>
        </div>
      )}

      {chaves.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead><TableHead>Chave</TableHead><TableHead>Empresa</TableHead><TableHead>Escopos</TableHead>
              <TableHead>Último uso</TableHead><TableHead className="text-right">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chaves.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell className="font-mono text-xs">{c.prefixo}…</TableCell>
                <TableCell>{nomeEmpresa(c.empresa_id)}</TableCell>
                <TableCell className="space-x-1">{c.escopos.map((e) => <Badge key={e} variant="secondary">{e}</Badge>)}</TableCell>
                <TableCell className="text-sm">{data(c.ultimo_uso)}</TableCell>
                <TableCell className="text-right">
                  {c.revogada_em ? (
                    <Badge variant="outline">Revogada</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={revogando}
                      onClick={() => {
                        if (!confirm(`Revogar a chave "${c.nome}"? Integrações que a usam vão parar.`)) return;
                        iniciar(async () => {
                          const r = await revogarChave(c.id);
                          if (r.erro) toast.error(r.erro); else toast.success(r.ok);
                        });
                      }}>Revogar</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma chave criada.</p>
      )}
    </div>
  );
}
