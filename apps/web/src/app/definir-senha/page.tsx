"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Depois de aceitar o convite: o usuário já está logado e cria a própria senha.
export default function DefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha !== confirmacao) return toast.error("As senhas não conferem.");
    setSalvando(true);
    const { error } = await criarClienteBrowser().auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Senha criada. Bem-vindo!");
    router.replace("/painel");
    router.refresh();
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Crie sua senha</CardTitle>
          <CardDescription>Você aceitou o convite para o ApuraRTC. Defina uma senha para os próximos acessos.</CardDescription>
        </CardHeader>
        <form onSubmit={salvar}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" minLength={8} required autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmacao">Confirme a senha</Label>
              <Input id="confirmacao" type="password" minLength={8} required autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
            </div>
          </CardContent>
          <CardFooter className="mt-6">
            <Button type="submit" className="w-full" disabled={salvando}>{salvando ? "Salvando…" : "Salvar senha"}</Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
