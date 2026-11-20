import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { somenteDigitos } from "@/lib/formatos";

async function criarEscritorio(formData: FormData) {
  "use server";
  const nome = String(formData.get("nome") ?? "").trim();
  const doc = somenteDigitos(String(formData.get("documento") ?? ""));
  if (!nome) return;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("criar_escritorio", {
    p_nome: nome,
    p_documento: doc.length === 11 || doc.length === 14 ? doc : undefined,
  });
  if (error) throw new Error(error.message);
  redirect("/empresas");
}

// 1º acesso: cria o escritório (ou a empresa, quando for uma empresa direta) e torna o usuário admin.
export default async function OnboardingPage() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { count } = await supabase.from("membros").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count) redirect("/painel");

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Bem-vindo ao ApuraRTC</CardTitle>
          <CardDescription>
            Cadastre seu escritório de contabilidade. Se você é uma empresa, use o nome da própria empresa.
          </CardDescription>
        </CardHeader>
        <form action={criarEscritorio}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" required maxLength={120} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="documento">CNPJ ou CPF (opcional)</Label>
              <Input id="documento" name="documento" inputMode="numeric" maxLength={18} />
            </div>
          </CardContent>
          <CardFooter className="mt-6">
            <Button type="submit" className="w-full">Criar escritório</Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
