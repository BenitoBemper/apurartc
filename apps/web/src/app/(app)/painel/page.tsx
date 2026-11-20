import { obterContexto } from "@/lib/contexto";

export default async function PainelPage() {
  const ctx = await obterContexto();
  return <h1 className="text-2xl font-semibold">Painel — {ctx.empresa?.razao_social ?? "sem empresa"}</h1>;
}
