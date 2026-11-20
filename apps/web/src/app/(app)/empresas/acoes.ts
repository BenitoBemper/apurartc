"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { obterContexto, COOKIE_EMPRESA } from "@/lib/contexto";
import { cnpjValido, somenteDigitos, UFS } from "@/lib/formatos";

export type EstadoForm = { erro?: string; ok?: string };

export async function criarEmpresa(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await obterContexto();
  if (ctx.papel !== "admin") return { erro: "Só o administrador cadastra empresas." };

  const cnpj = somenteDigitos(String(formData.get("cnpj") ?? ""));
  const razao = String(formData.get("razao_social") ?? "").trim();
  const uf = String(formData.get("uf") ?? "");
  const mun = somenteDigitos(String(formData.get("municipio_ibge") ?? ""));

  if (!cnpjValido(cnpj)) return { erro: "CNPJ inválido." };
  if (!razao) return { erro: "Informe a razão social." };
  if (uf && !(UFS as readonly string[]).includes(uf)) return { erro: "UF inválida." };
  if (mun && mun.length !== 7) return { erro: "Código IBGE do município tem 7 dígitos." };

  const { data, error } = await ctx.supabase
    .from("empresas")
    .insert({
      escritorio_id: ctx.escritorio.id,
      cnpj,
      razao_social: razao,
      uf: uf || null,
      municipio_ibge: mun ? Number(mun) : null,
    })
    .select("id")
    .single();
  if (error) {
    return { erro: error.code === "23505" ? "Este CNPJ já está cadastrado." : error.message };
  }
  if (!ctx.empresa) {
    (await cookies()).set(COOKIE_EMPRESA, data.id, { path: "/", maxAge: 31536000, sameSite: "lax" });
  }
  revalidatePath("/", "layout");
  return { ok: `${razao} cadastrada.` };
}
