import { obterContexto } from "@/lib/contexto";
import { Topo } from "@/components/topo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await obterContexto();
  return (
    <div className="min-h-svh bg-muted/30">
      <Topo
        escritorio={ctx.escritorio.nome}
        email={ctx.user.email ?? ""}
        papel={ctx.papel}
        empresas={ctx.empresas}
        empresaId={ctx.empresa?.id ?? null}
        competencia={ctx.competencia}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
