// Base da API pública /api/v1: autenticação pela chave, escopo, limite por minuto, empresa e auditoria.
// Usa o cliente admin (service_role): TODA consulta deve filtrar por chave.escritorioId (e chave.empresaId, se houver).
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { clienteAdmin } from "@/lib/supabase/admin";
import { chaveDoCabecalho, hashChave, type Escopo } from "@/lib/api-chave";
import { somenteDigitos } from "@/lib/formatos";

export const LIMITE_POR_MINUTO = 60;

export type ChaveApi = { id: string; escritorioId: string; empresaId: string | null; escopos: string[] };
export type ContextoApi = { chave: ChaveApi; admin: ReturnType<typeof clienteAdmin>; ip: string | null };
export type Empresa = { id: string; cnpj: string; razao_social: string };

export function erro(status: number, codigo: string, mensagem: string, extra?: HeadersInit) {
  return NextResponse.json({ erro: { codigo, mensagem } }, { status, headers: extra });
}

/** Autentica a requisição. Retorna o contexto ou a resposta de erro (401/403/429). */
export async function autenticar(req: NextRequest, escopo: Escopo): Promise<ContextoApi | NextResponse> {
  const valor = chaveDoCabecalho(req.headers);
  if (!valor) return erro(401, "NAO_AUTENTICADO", "Informe a chave no cabeçalho Authorization: Bearer artc_…");

  const admin = clienteAdmin();
  const { data: c } = await admin.from("api_chaves")
    .select("id, escritorio_id, empresa_id, escopos, revogada_em")
    .eq("hash_chave", hashChave(valor))
    .maybeSingle();
  if (!c || c.revogada_em) return erro(401, "CHAVE_INVALIDA", "Chave de API inválida ou revogada.");
  if (!c.escopos.includes(escopo)) return erro(403, "ESCOPO_INSUFICIENTE", `Esta chave não tem o escopo "${escopo}".`);

  const { data: dentro } = await admin.rpc("api_consumir_cota", { p_chave: c.id, p_limite: LIMITE_POR_MINUTO });
  if (dentro === false) {
    return erro(429, "LIMITE_EXCEDIDO", `Limite de ${LIMITE_POR_MINUTO} requisições por minuto.`, { "Retry-After": "60" });
  }
  void admin.from("api_chaves").update({ ultimo_uso: new Date().toISOString() }).eq("id", c.id).then(() => undefined);

  return {
    chave: { id: c.id, escritorioId: c.escritorio_id, empresaId: c.empresa_id, escopos: c.escopos },
    admin,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
  };
}

/** Empresa do escritório da chave pelo CNPJ (respeita a restrição de empresa da chave). */
export async function resolverEmpresa(ctx: ContextoApi, cnpj: string | null): Promise<Empresa | NextResponse> {
  const doc = somenteDigitos(cnpj ?? "");
  if (doc.length !== 14) return erro(400, "CNPJ_INVALIDO", "Informe o CNPJ da empresa (14 dígitos).");
  const { data } = await ctx.admin.from("empresas").select("id, cnpj, razao_social")
    .eq("escritorio_id", ctx.chave.escritorioId).eq("cnpj", doc).eq("ativo", true).maybeSingle();
  if (!data || (ctx.chave.empresaId && ctx.chave.empresaId !== data.id)) {
    return erro(404, "EMPRESA_NAO_ENCONTRADA", "Empresa não encontrada para esta chave.");
  }
  return data;
}

export async function auditar(ctx: ContextoApi, acao: string, entidade: string, entidadeId?: string, detalhes?: Record<string, unknown>) {
  await ctx.admin.from("auditoria").insert({
    escritorio_id: ctx.chave.escritorioId, user_id: null, acao, entidade, entidade_id: entidadeId ?? null,
    ip: ctx.ip, detalhes: { chave_id: ctx.chave.id, ...detalhes },
  });
}

/** Competência AAAA-MM válida ou null. */
export function competenciaValida(v: string | null): string | null {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}
