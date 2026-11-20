"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Modo = "entrar" | "cadastrar" | "link";

const TITULOS: Record<Modo, string> = {
  entrar: "Entrar",
  cadastrar: "Criar conta",
  link: "Entrar com link mágico",
};

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const supabase = criarClienteBrowser();
    const redirectTo = `${window.location.origin}/auth/callback`;
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        router.replace("/painel");
        router.refresh();
      } else if (modo === "cadastrar") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/onboarding");
          router.refresh();
        } else {
          toast.success("Conta criada. Confirme pelo link enviado ao seu e-mail.");
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        toast.success("Link enviado. Confira seu e-mail.");
      }
    } catch (err) {
      toast.error(traduzirErro((err as Error).message));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">ApuraRTC</CardTitle>
          <CardDescription>{TITULOS[modo]}</CardDescription>
        </CardHeader>
        <form onSubmit={enviar}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            {modo !== "link" && (
              <div className="grid gap-2">
                <Label htmlFor="senha">Senha</Label>
                <Input id="senha" type="password" minLength={8} required value={senha}
                  autoComplete={modo === "cadastrar" ? "new-password" : "current-password"}
                  onChange={(e) => setSenha(e.target.value)} />
              </div>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={carregando}>
              {carregando ? "Aguarde…" : TITULOS[modo]}
            </Button>
            <div className="flex w-full justify-between text-sm">
              {modo !== "entrar" ? (
                <button type="button" className="underline" onClick={() => setModo("entrar")}>Entrar com senha</button>
              ) : (
                <button type="button" className="underline" onClick={() => setModo("cadastrar")}>Criar conta</button>
              )}
              {modo !== "link" && (
                <button type="button" className="underline" onClick={() => setModo("link")}>Link mágico</button>
              )}
            </div>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}

function traduzirErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/already registered/i.test(msg)) return "Este e-mail já tem conta. Use Entrar.";
  if (/password/i.test(msg)) return "Senha inválida (mínimo de 8 caracteres).";
  if (/rate limit/i.test(msg)) return "Muitas tentativas. Aguarde alguns minutos.";
  return msg;
}
