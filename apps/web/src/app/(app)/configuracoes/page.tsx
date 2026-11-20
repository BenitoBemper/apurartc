import { obterContexto } from "@/lib/contexto";
import { clienteAdmin } from "@/lib/supabase/admin";
import { formatarCompetencia } from "@/lib/formatos";
import { mesesAte } from "@/lib/relatorio";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConviteForm, MembroLinha } from "./membros";
import { ChavesApi } from "./chaves";

export const metadata = { title: "Configurações · ApuraRTC" };

const LIMITE_MVP = 5000;

export default async function ConfiguracoesPage() {
  const ctx = await obterContexto();
  const ehAdmin = ctx.papel === "admin";
  const meses = mesesAte(ctx.competencia, 6);

  const [membros, restricoes, chaves, uso] = await Promise.all([
    ctx.supabase.from("membros").select("id, user_id, papel, criado_em").eq("escritorio_id", ctx.escritorio.id).order("criado_em"),
    ctx.supabase.from("membros_empresas").select("membro_id, empresa_id").eq("escritorio_id", ctx.escritorio.id),
    ehAdmin
      ? ctx.supabase.from("api_chaves").select("id, nome, prefixo, escopos, empresa_id, ultimo_uso, revogada_em, criado_em")
          .eq("escritorio_id", ctx.escritorio.id).order("criado_em", { ascending: false })
      : Promise.resolve({ data: [] }),
    ctx.supabase.from("uso_mensal").select("competencia, qtd_notas, qtd_cnpjs").eq("escritorio_id", ctx.escritorio.id)
      .gte("competencia", `${meses[0]}-01`).lte("competencia", `${meses[5]}-01`),
  ]);

  // E-mails ficam em auth.users: só o admin consulta (via cliente admin, filtrado pelos membros do próprio escritório)
  const emails = new Map<string, string>();
  if (ehAdmin) {
    const admin = clienteAdmin();
    await Promise.all((membros.data ?? []).map(async (m) => {
      const { data } = await admin.auth.admin.getUserById(m.user_id);
      emails.set(m.user_id, data.user?.email ?? "—");
    }));
  }
  const empresasPorMembro = new Map<string, string[]>();
  for (const r of restricoes.data ?? []) empresasPorMembro.set(r.membro_id, [...(empresasPorMembro.get(r.membro_id) ?? []), r.empresa_id]);
  const usoPorMes = new Map((uso.data ?? []).map((u) => [u.competencia.slice(0, 7), u]));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">{ctx.escritorio.nome}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>
            Administrador: tudo. Operador: importa arquivos. Leitor: só consulta. Sem empresas marcadas, o membro acessa todas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {ehAdmin && <ConviteForm empresas={ctx.empresas} />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Empresas</TableHead>
                {ehAdmin && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(membros.data ?? []).map((m) => (
                <MembroLinha
                  key={m.id}
                  id={m.id}
                  email={ehAdmin ? emails.get(m.user_id) ?? "—" : m.user_id === ctx.user.id ? ctx.user.email ?? "você" : "membro"}
                  voce={m.user_id === ctx.user.id}
                  papel={m.papel}
                  empresasSelecionadas={empresasPorMembro.get(m.id) ?? []}
                  empresas={ctx.empresas}
                  editavel={ehAdmin}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {ehAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Chaves da API</CardTitle>
            <CardDescription>
              Para o ERP enviar arquivos e consultar resultados pela API <code>/api/v1</code>. A chave aparece uma única vez; guardamos só o hash.
              {" "}<a className="underline" href="/api/v1/docs" target="_blank">Documentação da API</a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChavesApi chaves={chaves.data ?? []} empresas={ctx.empresas} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Uso do plano gratuito</CardTitle>
          <CardDescription>Até {LIMITE_MVP.toLocaleString("pt-BR")} notas por mês, somando todas as empresas do escritório.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {meses.map((m) => {
            const u = usoPorMes.get(m);
            const pct = Math.min(100, Math.round(((u?.qtd_notas ?? 0) / LIMITE_MVP) * 100));
            return (
              <div key={m} className="grid grid-cols-[70px_1fr_200px] items-center gap-3 text-sm">
                <span>{formatarCompetencia(m)}</span>
                <div className="h-2 rounded-full bg-muted">
                  <div className={`h-2 rounded-full ${pct >= 70 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-right tabular-nums">{(u?.qtd_notas ?? 0).toLocaleString("pt-BR")} notas · {u?.qtd_cnpjs ?? 0} CNPJ(s)</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
