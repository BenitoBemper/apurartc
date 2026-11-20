"use server";
// Ações de Configurações (só admin). Gravações em membros/api_chaves usam o cliente do usuário (RLS de admin);
// o cliente admin é usado apenas para o Auth (convite / localizar usuário por e-mail).
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { obterContexto } from "@/lib/contexto";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ESCOPOS, gerarChave, type Escopo } from "@/lib/api-chave";

export type Estado = { erro?: string; ok?: string; chave?: string };
const PAPEIS = ["admin", "operador", "leitor"] as const;
type Papel = (typeof PAPEIS)[number];

async function exigirAdmin() {
  const ctx = await obterContexto();
  if (ctx.papel !== "admin") throw new Error("Só o administrador do escritório pode fazer isso.");
  return ctx;
}

function mensagem(e: unknown): string {
  const m = (e as Error).message ?? String(e);
  if (/precisa de ao menos um administrador/.test(m)) return "O escritório precisa de ao menos um administrador.";
  return m;
}

/** Empresas marcadas no formulário, conferidas contra as do escritório. */
function empresasDoForm(form: FormData, validas: Set<string>): string[] {
  return form.getAll("empresas").map(String).filter((id) => validas.has(id));
}

export async function convidarMembro(_: Estado, form: FormData): Promise<Estado> {
  try {
    const ctx = await exigirAdmin();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const papel = String(form.get("papel")) as Papel;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: "E-mail inválido." };
    if (!PAPEIS.includes(papel)) return { erro: "Papel inválido." };

    const admin = clienteAdmin();
    let userId = (await admin.rpc("usuario_por_email", { p_email: email })).data as string | null;
    let convidado = false;
    if (!userId) {
      const origem = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origem}/definir-senha` });
      if (error) return { erro: `Não foi possível enviar o convite: ${error.message}` };
      userId = data.user.id;
      convidado = true;
    }

    const { data: membro, error } = await ctx.supabase
      .from("membros")
      .insert({ user_id: userId, escritorio_id: ctx.escritorio.id, papel })
      .select("id")
      .single();
    if (error) return { erro: error.code === "23505" ? "Esta pessoa já é membro do escritório." : error.message };

    const empresas = empresasDoForm(form, new Set(ctx.empresas.map((e) => e.id)));
    if (empresas.length) {
      const r = await ctx.supabase.from("membros_empresas")
        .insert(empresas.map((empresa_id) => ({ membro_id: membro.id, empresa_id, escritorio_id: ctx.escritorio.id })));
      if (r.error) return { erro: r.error.message };
    }
    revalidatePath("/configuracoes");
    return { ok: convidado ? `Convite enviado para ${email}.` : `${email} já tinha conta e foi adicionado ao escritório.` };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export async function alterarMembro(membroId: string, papel: Papel, empresas: string[]): Promise<Estado> {
  try {
    const ctx = await exigirAdmin();
    if (!PAPEIS.includes(papel)) return { erro: "Papel inválido." };
    const up = await ctx.supabase.from("membros").update({ papel }).eq("id", membroId).eq("escritorio_id", ctx.escritorio.id);
    if (up.error) return { erro: mensagem(up.error) };

    const validas = new Set(ctx.empresas.map((e) => e.id));
    const del = await ctx.supabase.from("membros_empresas").delete().eq("membro_id", membroId);
    if (del.error) return { erro: del.error.message };
    const lista = empresas.filter((id) => validas.has(id));
    if (lista.length) {
      const ins = await ctx.supabase.from("membros_empresas")
        .insert(lista.map((empresa_id) => ({ membro_id: membroId, empresa_id, escritorio_id: ctx.escritorio.id })));
      if (ins.error) return { erro: ins.error.message };
    }
    revalidatePath("/configuracoes");
    return { ok: "Membro atualizado." };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export async function removerMembro(membroId: string): Promise<Estado> {
  try {
    const ctx = await exigirAdmin();
    const { error, count } = await ctx.supabase.from("membros").delete({ count: "exact" })
      .eq("id", membroId).eq("escritorio_id", ctx.escritorio.id);
    if (error) return { erro: mensagem(error) };
    if (!count) return { erro: "Membro não encontrado." };
    revalidatePath("/configuracoes");
    return { ok: "Membro removido." };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export async function criarChave(_: Estado, form: FormData): Promise<Estado> {
  try {
    const ctx = await exigirAdmin();
    const nome = String(form.get("nome") ?? "").trim();
    const escopos = form.getAll("escopos").map(String).filter((s): s is Escopo => (ESCOPOS as readonly string[]).includes(s));
    const empresa = String(form.get("empresa") ?? "");
    if (!nome) return { erro: "Dê um nome à chave (ex.: ERP da filial)." };
    if (!escopos.length) return { erro: "Escolha ao menos um escopo." };
    if (empresa && !ctx.empresas.some((e) => e.id === empresa)) return { erro: "Empresa inválida." };

    const { chave, prefixo, hash } = gerarChave();
    const { error } = await ctx.supabase.from("api_chaves").insert({
      escritorio_id: ctx.escritorio.id, empresa_id: empresa || null, nome, prefixo, hash_chave: hash, escopos, criado_por: ctx.user.id,
    });
    if (error) return { erro: error.message };
    revalidatePath("/configuracoes");
    return { ok: "Chave criada. Copie agora: ela não será exibida de novo.", chave };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

export async function revogarChave(id: string): Promise<Estado> {
  try {
    const ctx = await exigirAdmin();
    const { error } = await ctx.supabase.from("api_chaves").update({ revogada_em: new Date().toISOString() })
      .eq("id", id).eq("escritorio_id", ctx.escritorio.id).is("revogada_em", null);
    if (error) return { erro: error.message };
    revalidatePath("/configuracoes");
    return { ok: "Chave revogada." };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}
