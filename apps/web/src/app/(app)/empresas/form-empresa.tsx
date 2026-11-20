"use client";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { criarEmpresa, type EstadoForm } from "./acoes";
import { UFS } from "@/lib/formatos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FormEmpresa() {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarEmpresa, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.erro) toast.error(estado.erro);
    if (estado.ok) {
      toast.success(estado.ok);
      form.current?.reset();
    }
  }, [estado]);

  return (
    // onSubmit + startTransition em vez de action={acao}: o React 19 limpa o form após cada action,
    // inclusive com erro (o usuário perderia o que digitou). Aqui só limpamos no sucesso.
    <form ref={form} className="grid gap-4 sm:grid-cols-[180px_1fr_100px_140px_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => acao(dados));
      }}>
      <div className="grid gap-2">
        <Label htmlFor="cnpj">CNPJ</Label>
        <Input id="cnpj" name="cnpj" required inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="razao_social">Razão social</Label>
        <Input id="razao_social" name="razao_social" required maxLength={150} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="uf">UF</Label>
        <Select name="uf">
          <SelectTrigger id="uf"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="municipio_ibge">Município (IBGE)</Label>
        <Input id="municipio_ibge" name="municipio_ibge" inputMode="numeric" maxLength={7} placeholder="4314902" />
      </div>
      <Button type="submit" disabled={pendente}>{pendente ? "Salvando…" : "Cadastrar"}</Button>
    </form>
  );
}
