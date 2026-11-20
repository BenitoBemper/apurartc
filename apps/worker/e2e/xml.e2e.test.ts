// Ponta a ponta com XML: ZIP com nota emitida, nota recebida, nota de outra empresa e um cancelamento.
// Requer: Supabase local, calculadora e worker rodando (como importacao.e2e.test.ts).
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { strToU8, zipSync } from "fflate";
import type { Database } from "@apurartc/db";
import { beforeAll, describe, expect, it } from "vitest";
import { ARROZ, CERVEJA, chaveTeste, nfeProc, procEventoCancelamento } from "./fixtures/nfe.js";

process.loadEnvFile(new URL("../../web/.env.local", import.meta.url));
process.loadEnvFile(new URL("../.env", import.meta.url));

const ESC_A = "e0000000-0000-0000-0000-00000000000a";
const EMP_A1 = "c0000000-0000-0000-0000-0000000000a1";
const CNPJ_A1 = "12345678000195";
const FORNECEDOR = "98765432000198";

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});

const n = Number(String(Date.now()).slice(-8)); // números de nota únicos por execução
const chEmitida = chaveTeste(CNPJ_A1, n);
const chRecebida = chaveTeste(FORNECEDOR, n + 1);
const base = { dhEmi: "2027-03-20T10:00:00-03:00", cMunFG: "4314902" };

const zip = zipSync({
  "emitida.xml": strToU8(nfeProc({ ...base, chave: chEmitida, nNF: String(n), cnpjEmit: CNPJ_A1, cnpjDest: FORNECEDOR, itens: [ARROZ, CERVEJA] })),
  "recebida.xml": strToU8(nfeProc({ ...base, chave: chRecebida, cnpjEmit: FORNECEDOR, cnpjDest: CNPJ_A1, itens: [ARROZ] })),
  "outra-empresa.xml": strToU8(nfeProc({ ...base, chave: chaveTeste(FORNECEDOR, n + 2), cnpjEmit: FORNECEDOR, cnpjDest: "11222333000181", itens: [ARROZ] })),
  "cancelamento.xml": strToU8(procEventoCancelamento(chEmitida)),
});

async function importar(nome: string, dados: Uint8Array, formato: "zip" | "xml_nfe") {
  const path = `${ESC_A}/${EMP_A1}/importacoes/${randomUUID()}__${nome}`;
  const tipo = formato === "zip" ? "application/zip" : "application/xml";
  const up = await sb.storage.from("arquivos").upload(path, new Blob([dados], { type: tipo }), { contentType: tipo });
  if (up.error) throw up.error;
  const hash = createHash("sha256").update(dados).digest("hex");
  const { data, error } = await sb.from("importacoes")
    .insert({ empresa_id: EMP_A1, escritorio_id: ESC_A, formato, arquivo_path: path, hash_sha256: hash })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

async function aguardar(id: string) {
  const fim = Date.now() + 90_000;
  for (;;) {
    const { data } = await sb.from("importacoes").select("status, qtd_docs, qtd_erros, mensagem_erro").eq("id", id).single();
    if (data && (data.status === "concluido" || data.status === "erro")) return data;
    if (Date.now() > fim) throw new Error(`timeout (status ${data?.status}); o worker está rodando?`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

describe("importação XML/ZIP ponta a ponta", () => {
  let idZip = "";

  beforeAll(async () => {
    const { error } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_SENHA! });
    if (error) throw error;
    idZip = await importar("lote.zip", zip, "zip");
  });

  it("processa as notas válidas e registra a de outra empresa como erro", async () => {
    const imp = await aguardar(idZip);
    expect(imp).toMatchObject({ status: "concluido", qtd_docs: 2, mensagem_erro: "1 nota(s) com erro não foram calculadas" });

    const { data: docs } = await sb.from("documentos").select("chave_acesso, papel, tipo_dfe, competencia, arquivo_origem")
      .eq("importacao_id", idZip).order("papel");
    expect(docs).toEqual([
      { chave_acesso: chEmitida, papel: "emitida", tipo_dfe: "NFE", competencia: "2027-03-01", arquivo_origem: "emitida.xml" },
      { chave_acesso: chRecebida, papel: "recebida", tipo_dfe: "NFE", competencia: "2027-03-01", arquivo_origem: "recebida.xml" },
    ]);

    const { data: ocorr } = await sb.from("erros_validacao").select("codigo, arquivo_origem, mensagem").eq("importacao_id", idZip).order("codigo");
    expect(ocorr!.map((o) => [o.codigo, o.arquivo_origem])).toEqual([["AVISO", "cancelamento.xml"], ["XML", "outra-empresa.xml"]]);
  });

  it("compara o destacado no XML com o calculado", async () => {
    const { data } = await sb.from("vw_divergencias").select("tributo, item_numero, informado, calculado, diferenca, papel")
      .eq("importacao_id", idZip).eq("papel", "emitida").eq("tributo", "CBS").order("item_numero");
    // arroz: ERP destacou 8,80 de CBS, mas a cesta básica tem redução de 100% → calculado 0
    expect(data!.map((d) => [d.item_numero, Number(d.informado), Number(d.calculado), Number(d.diferenca)])).toEqual([
      [1, 8.8, 0, -8.8],
      [2, 14.52, 14.52, 0],
    ]);
  });

  it("a mesma nota em outro arquivo é ignorada (não conta em dobro)", async () => {
    const xml = nfeProc({ ...base, chave: chEmitida, nNF: String(n), cnpjEmit: CNPJ_A1, cnpjDest: FORNECEDOR, itens: [ARROZ, CERVEJA] });
    const id = await importar("repetida.xml", strToU8(xml + " "), "xml_nfe"); // conteúdo diferente → hash diferente
    const imp = await aguardar(id);
    expect(imp).toMatchObject({ status: "erro", qtd_docs: 0, mensagem_erro: "Nenhuma nota nova para calcular" });
    const { data } = await sb.from("erros_validacao").select("codigo, mensagem").eq("importacao_id", id);
    expect(data).toEqual([{ codigo: "AVISO", mensagem: `nota ${chEmitida} já importada: ignorada` }]);
  });
});
