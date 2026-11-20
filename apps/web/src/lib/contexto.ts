import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Enum } from "@apurartc/db";
import { criarClienteServidor } from "@/lib/supabase/server";
import { competenciaAtual } from "@/lib/formatos";

export const COOKIE_EMPRESA = "apurartc_empresa";
export const COOKIE_COMPETENCIA = "apurartc_competencia";

export type EmpresaResumo = { id: string; cnpj: string; razao_social: string };

/** Usuário logado, escritório, papel, empresas visíveis e a seleção do topo (empresa + competência AAAA-MM). */
export const obterContexto = cache(async () => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membros } = await supabase
    .from("membros")
    .select("papel, escritorio_id, escritorios(nome)")
    .eq("user_id", user.id)
    .order("criado_em")
    .limit(1);
  const membro = membros?.[0];
  if (!membro) redirect("/onboarding");

  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, cnpj, razao_social")
    .eq("escritorio_id", membro.escritorio_id)
    .eq("ativo", true)
    .order("razao_social");

  const jar = await cookies();
  const lista: EmpresaResumo[] = empresas ?? [];
  const empresa = lista.find((e) => e.id === jar.get(COOKIE_EMPRESA)?.value) ?? lista[0] ?? null;
  const compCookie = jar.get(COOKIE_COMPETENCIA)?.value;
  const competencia = compCookie && /^\d{4}-(0[1-9]|1[0-2])$/.test(compCookie) ? compCookie : competenciaAtual();

  return {
    supabase,
    user,
    papel: membro.papel as Enum<"papel_membro">,
    escritorio: { id: membro.escritorio_id, nome: membro.escritorios?.nome ?? "" },
    empresas: lista,
    empresa,
    competencia,
  };
});
