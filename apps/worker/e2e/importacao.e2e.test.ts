// Ponta a ponta: login (admin.a do seed) → upload no Storage → importação (RLS + fila) → worker → calculadora → banco.
// Requer: Supabase local, calculadora (npm run calc:up) e o worker rodando (npm run dev:worker).
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@apurartc/db";
import { beforeAll, describe, expect, it } from "vitest";

process.loadEnvFile(new URL("../../web/.env.local", import.meta.url));
process.loadEnvFile(new URL("../.env", import.meta.url));

const ESC_A = "e0000000-0000-0000-0000-00000000000a";
const EMP_A1 = "c0000000-0000-0000-0000-0000000000a1";
// Usuário admin do Escritório A (supabase/seed.sql); credenciais em apps/worker/.env (E2E_EMAIL, E2E_SENHA)
const USUARIO = { email: process.env.E2E_EMAIL ?? "", password: process.env.E2E_SENHA ?? "" };
if (!USUARIO.email || !USUARIO.password) throw new Error("defina E2E_EMAIL e E2E_SENHA em apps/worker/.env");

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});

// Exemplo oficial (docs/exemplos.md) + campos do ApuraRTC. id único para não repetir o hash entre execuções.
const exemplo = JSON.parse(readFileSync(new URL("../../../infra/calculadora/exemplos/operacao.json", import.meta.url), "utf8"));
exemplo.id = randomUUID().replace(/-/g, "");
exemplo.chaveAcesso = "4327031122233300018155001" + String(Date.now()).slice(-9).padStart(9, "0") + "1" + "00000000" + "9";
exemplo.itens[0].informado = { cbs: 1.0 };    // calculado 0,00 → divergência de −1,00
exemplo.itens[2].informado = { cbs: 42.24 };  // igual ao calculado → diferença 0
const conteudo = JSON.stringify(exemplo);
const hash = createHash("sha256").update(conteudo).digest("hex");

let importacaoId = "";

async function aguardarStatus(id: string, timeoutMs = 90_000) {
  const fim = Date.now() + timeoutMs;
  for (;;) {
    const { data } = await sb.from("importacoes").select("status, qtd_docs, qtd_erros, mensagem_erro").eq("id", id).single();
    if (data && (data.status === "concluido" || data.status === "erro")) return data;
    if (Date.now() > fim) throw new Error(`timeout; último status: ${data?.status} (o worker está rodando?)`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

describe("importação JSON ponta a ponta", () => {
  beforeAll(async () => {
    const { error } = await sb.auth.signInWithPassword(USUARIO);
    if (error) throw error;
  });

  it("envia o arquivo e registra a importação", async () => {
    const path = `${ESC_A}/${EMP_A1}/importacoes/${randomUUID()}.json`;
    const up = await sb.storage.from("arquivos").upload(path, new Blob([conteudo], { type: "application/json" }));
    expect(up.error).toBeNull();

    const { data, error } = await sb
      .from("importacoes")
      .insert({ empresa_id: EMP_A1, escritorio_id: ESC_A, formato: "json", arquivo_path: path, hash_sha256: hash })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(data!.status).toBe("recebido");
    importacaoId = data!.id;
  });

  it("bloqueia o mesmo arquivo duas vezes", async () => {
    const { error } = await sb
      .from("importacoes")
      .insert({ empresa_id: EMP_A1, escritorio_id: ESC_A, formato: "json", arquivo_path: "x/dup.json", hash_sha256: hash });
    expect(error?.code).toBe("23505");
  });

  it("o worker processa e os totais conferem com docs/exemplos.md", async () => {
    const imp = await aguardarStatus(importacaoId);
    expect(imp).toMatchObject({ status: "concluido", qtd_docs: 1, qtd_erros: 1, mensagem_erro: null });

    const { data: doc } = await sb.from("documentos").select("id, competencia, chave_acesso").eq("importacao_id", importacaoId).single();
    expect(doc!.competencia).toBe("2027-03-01");

    const { data: linhas } = await sb.from("vw_divergencias").select("tributo, item_numero, informado, calculado, diferenca")
      .eq("documento_id", doc!.id);
    const soma = (t: string) =>
      Math.round((linhas ?? []).filter((l) => l.tributo === t).reduce((s, l) => s + Number(l.calculado ?? 0), 0) * 100) / 100;
    expect(soma("CBS")).toBe(56.76);
    expect(soma("IBS_UF") + soma("IBS_MUN")).toBe(0.64);
    expect(soma("IS")).toBe(15);

    const cbs = (n: number) => linhas!.find((l) => l.tributo === "CBS" && l.item_numero === n)!;
    expect(Number(cbs(1).diferenca)).toBe(-1);
    expect(Number(cbs(3).diferenca)).toBe(0);
  });

  it("registra o erro do item 4 (REG-011)", async () => {
    const { data } = await sb.from("erros_validacao").select("codigo, item_numero, campo").eq("importacao_id", importacaoId);
    expect(data).toEqual([{ codigo: "REG-011", item_numero: 4, campo: "#/itens/3/ncm" }]);
  });

  it("guarda o ROC completo no Storage", async () => {
    const { data } = await sb.from("resultados_calculo").select("roc_path").limit(1).like("roc_path", `%${importacaoId}%`);
    const arquivo = data![0].roc_path!.split("#")[0];
    const { data: blob, error } = await sb.storage.from("arquivos").download(arquivo);
    expect(error).toBeNull();
    const roc = JSON.parse(await blob!.text());
    expect(roc[0].total.tribCalc.IBSCBSTot.gCBS.vCBS).toBe("56.76");
  });
});
