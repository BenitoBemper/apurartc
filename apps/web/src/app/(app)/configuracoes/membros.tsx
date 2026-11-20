"use client";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { alterarMembro, convidarMembro, removerMembro, type Estado } from "./acoes";
import type { EmpresaResumo } from "@/lib/contexto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";

const PAPEIS = { admin: "Administrador", operador: "Operador", leitor: "Leitor" } as const;
type Papel = keyof typeof PAPEIS;
const seletor = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

function avisar(r: Estado) {
  if (r.erro) toast.error(r.erro);
  if (r.ok) toast.success(r.ok);
}

function EscolherEmpresas({ empresas, marcadas, nome, onChange }: {
  empresas: EmpresaResumo[]; marcadas: string[]; nome?: string; onChange?: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {empresas.map((e) => (
        <label key={e.id} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name={nome} value={e.id} defaultChecked={marcadas.includes(e.id)}
            onChange={(ev) => onChange?.(ev.target.checked ? [...marcadas, e.id] : marcadas.filter((x) => x !== e.id))} />
          {e.razao_social}
        </label>
      ))}
    </div>
  );
}

export function ConviteForm({ empresas }: { empresas: EmpresaResumo[] }) {
  const [estado, acao, pendente] = useActionState<Estado, FormData>(convidarMembro, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    avisar(estado);
    if (estado.ok) form.current?.reset();
  }, [estado]);

  return (
    <form ref={form} className="grid gap-3 rounded-lg border p-4"
      onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); startTransition(() => acao(d)); }}>
      <div className="font-medium">Convidar membro</div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" required className="w-72" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="papel">Papel</Label>
          <select id="papel" name="papel" defaultValue="operador" className={seletor}>
            {Object.entries(PAPEIS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={pendente}>{pendente ? "Enviando…" : "Convidar"}</Button>
      </div>
      {empresas.length > 1 && (
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Restringir a estas empresas (opcional):</span>
          <EscolherEmpresas empresas={empresas} marcadas={[]} nome="empresas" />
        </div>
      )}
    </form>
  );
}

export function MembroLinha(p: {
  id: string; email: string; voce: boolean; papel: Papel; empresasSelecionadas: string[]; empresas: EmpresaResumo[]; editavel: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [papel, setPapel] = useState<Papel>(p.papel);
  const [empresas, setEmpresas] = useState<string[]>(p.empresasSelecionadas);
  const [pendente, iniciar] = useTransition();
  const nomes = p.empresas.filter((e) => p.empresasSelecionadas.includes(e.id)).map((e) => e.razao_social);

  return (
    <TableRow className="align-top">
      <TableCell>
        {p.email} {p.voce && <Badge variant="outline" className="ml-1">você</Badge>}
      </TableCell>
      <TableCell>
        {editando ? (
          <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)} className={seletor} aria-label="Papel">
            {Object.entries(PAPEIS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        ) : (
          <Badge variant={p.papel === "admin" ? "default" : "secondary"}>{PAPEIS[p.papel]}</Badge>
        )}
      </TableCell>
      <TableCell className="max-w-md whitespace-normal">
        {editando ? (
          <EscolherEmpresas empresas={p.empresas} marcadas={empresas} onChange={setEmpresas} />
        ) : (
          <span className="text-sm">{nomes.length ? nomes.join(", ") : "Todas"}</span>
        )}
      </TableCell>
      {p.editavel && (
        <TableCell className="text-right">
          {editando ? (
            <div className="flex justify-end gap-2">
              <Button size="sm" disabled={pendente} onClick={() => iniciar(async () => {
                const r = await alterarMembro(p.id, papel, empresas);
                avisar(r);
                if (!r.erro) setEditando(false);
              })}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setPapel(p.papel); setEmpresas(p.empresasSelecionadas); setEditando(false); }}>Cancelar</Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditando(true)}>Editar</Button>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={pendente}
                onClick={() => {
                  if (!confirm(`Remover ${p.email} do escritório?`)) return;
                  iniciar(async () => avisar(await removerMembro(p.id)));
                }}>Remover</Button>
            </div>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
