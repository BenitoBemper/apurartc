import { obterContexto } from "@/lib/contexto";
import { formatarCnpj } from "@/lib/formatos";
import { FormEmpresa } from "./form-empresa";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Empresas · ApuraRTC" };

export default async function EmpresasPage() {
  const ctx = await obterContexto();
  const { data: empresas } = await ctx.supabase
    .from("empresas")
    .select("id, cnpj, razao_social, uf, municipio_ibge, ativo")
    .eq("escritorio_id", ctx.escritorio.id)
    .order("razao_social");

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Empresas</h1>

      {ctx.papel === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Nova empresa</CardTitle>
            <CardDescription>Matriz e filiais são cadastradas uma a uma; a matriz é identificada pela raiz do CNPJ.</CardDescription>
          </CardHeader>
          <CardContent><FormEmpresa /></CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          {empresas?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão social</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>Município (IBGE)</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresas.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.razao_social}</TableCell>
                    <TableCell className="font-mono text-sm">{formatarCnpj(e.cnpj)}</TableCell>
                    <TableCell>{e.cnpj.slice(8, 12) === "0001" ? "Matriz" : "Filial"}</TableCell>
                    <TableCell>{e.uf ?? "—"}</TableCell>
                    <TableCell>{e.municipio_ibge ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={e.ativo ? "secondary" : "outline"}>{e.ativo ? "Ativa" : "Inativa"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              Nenhuma empresa cadastrada{ctx.papel === "admin" ? ". Cadastre a primeira acima." : "."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
