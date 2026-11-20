import { obterContexto } from "@/lib/contexto";
import { Importador } from "./importador";

export const metadata = { title: "Importar · ApuraRTC" };

export default async function ImportarPage() {
  const ctx = await obterContexto();
  if (!ctx.empresa) {
    return <p className="text-muted-foreground">Cadastre uma empresa antes de importar arquivos.</p>;
  }

  const { data: historico } = await ctx.supabase
    .from("importacoes")
    .select("id, formato, arquivo_path, status, qtd_docs, qtd_erros, mensagem_erro, criado_em")
    .eq("empresa_id", ctx.empresa.id)
    .order("criado_em", { ascending: false })
    .limit(30);

  return (
    <Importador
      key={ctx.empresa.id}
      escritorioId={ctx.escritorio.id}
      empresa={ctx.empresa}
      podeImportar={ctx.papel !== "leitor"}
      historicoInicial={historico ?? []}
    />
  );
}
