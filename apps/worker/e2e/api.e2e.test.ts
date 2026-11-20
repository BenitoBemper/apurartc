// Ponta a ponta da API pública /api/v1 (web em :3000, worker, calculadora e Supabase locais rodando).
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { strToU8, zipSync } from "fflate";
import type { Database } from "@apurartc/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ARROZ, CERVEJA, chaveTeste, nfeProc } from "./fixtures/nfe.js";

process.loadEnvFile(new URL("../.env", import.meta.url));

const API = process.env.API_URL ?? "http://localhost:3000/api/v1";
const ESC_A = "e0000000-0000-0000-0000-00000000000a";
const EMP_A2 = "c0000000-0000-0000-0000-0000000000a2";
const CNPJ_A1 = "12345678000195";
const CNPJ_B1 = "98765432000198";

const admin = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const criadas: string[] = [];

async function novaChave(escopos: string[], extra: { empresa_id?: string; revogada?: boolean } = {}) {
  const chave = `artc_${randomBytes(32).toString("base64url")}`;
  const { data, error } = await admin.from("api_chaves").insert({
    escritorio_id: ESC_A, empresa_id: extra.empresa_id ?? null, nome: "e2e", prefixo: chave.slice(0, 12),
    hash_chave: createHash("sha256").update(chave).digest("hex"), escopos,
    revogada_em: extra.revogada ? new Date().toISOString() : null,
  }).select("id").single();
  if (error) throw error;
  criadas.push(data.id);
  return chave;
}

const chamar = (caminho: string, chave?: string, init: RequestInit = {}) =>
  fetch(`${API}${caminho}`, { ...init, headers: { ...(chave && { Authorization: `Bearer ${chave}` }), ...init.headers } });

async function aguardar(id: string, chave: string) {
  const fim = Date.now() + 90_000;
  for (;;) {
    const r = await (await chamar(`/importacoes/${id}`, chave)).json();
    if (r.status === "concluido" || r.status === "erro") return r;
    if (Date.now() > fim) throw new Error(`timeout (status ${r.status}); o worker está rodando?`);
    await new Promise((x) => setTimeout(x, 1000));
  }
}

let completa = "", soConsulta = "", revogada = "", soA2 = "";
const n = 70000000 + Number(String(Date.now()).slice(-6));

beforeAll(async () => {
  [completa, soConsulta, revogada, soA2] = await Promise.all([
    novaChave(["importar", "consultar"]), novaChave(["consultar"]), novaChave(["importar", "consultar"], { revogada: true }),
    novaChave(["importar", "consultar"], { empresa_id: EMP_A2 }),
  ]);
});
afterAll(async () => {
  if (criadas.length) await admin.from("api_chaves").delete().in("id", criadas);
});

describe("autenticação e autorização", () => {
  it("sem chave, chave inválida ou revogada → 401", async () => {
    expect((await chamar("/apuracao?cnpj=" + CNPJ_A1 + "&competencia=2027-03")).status).toBe(401);
    expect((await chamar("/apuracao?cnpj=" + CNPJ_A1 + "&competencia=2027-03", "artc_" + "x".repeat(43))).status).toBe(401);
    const r = await chamar("/apuracao?cnpj=" + CNPJ_A1 + "&competencia=2027-03", revogada);
    expect(r.status).toBe(401);
    expect((await r.json()).erro.codigo).toBe("CHAVE_INVALIDA");
  });

  it("chave sem escopo importar → 403", async () => {
    const r = await chamar(`/importacoes?cnpj=${CNPJ_A1}`, soConsulta, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(r.status).toBe(403);
  });

  it("empresa de outro escritório ou fora da restrição da chave → 404", async () => {
    expect((await chamar(`/apuracao?cnpj=${CNPJ_B1}&competencia=2027-03`, completa)).status).toBe(404);
    expect((await chamar(`/apuracao?cnpj=${CNPJ_A1}&competencia=2027-03`, soA2)).status).toBe(404);
  });

  it("parâmetros inválidos → 400 com mensagem", async () => {
    const r = await chamar(`/apuracao?cnpj=${CNPJ_A1}&competencia=2027-13`, completa);
    expect(r.status).toBe(400);
    expect((await r.json()).erro.mensagem).toMatch(/competencia/);
  });
});

describe("importação pela API", () => {
  let id = "";
  const chEmitida = chaveTeste(CNPJ_A1, n);
  const zip = zipSync({
    "venda.xml": strToU8(nfeProc({ chave: chEmitida, nNF: String(n), dhEmi: "2027-03-28T10:00:00-03:00", cMunFG: "4314902", cnpjEmit: CNPJ_A1, cnpjDest: CNPJ_B1, itens: [ARROZ, CERVEJA] })),
  });

  it("POST multipart (ZIP) → 202 e processa", async () => {
    const form = new FormData();
    form.set("cnpj", CNPJ_A1);
    form.set("arquivo", new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), "lote-api.zip");
    const r = await chamar("/importacoes", completa, { method: "POST", body: form });
    expect(r.status).toBe(202);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ cnpj: CNPJ_A1, formato: "zip", status: "recebido" });
    expect(r.headers.get("location")).toBe(`/api/v1/importacoes/${corpo.id}`);
    id = corpo.id;

    const fim = await aguardar(id, completa);
    expect(fim).toMatchObject({ status: "concluido", notas: 1, erros: 0, ocorrencias: [] });
  });

  it("mesmo arquivo de novo → 409", async () => {
    const form = new FormData();
    form.set("cnpj", CNPJ_A1);
    form.set("arquivo", new Blob([zip as Uint8Array<ArrayBuffer>]), "de-novo.zip");
    const r = await chamar("/importacoes", completa, { method: "POST", body: form });
    expect(r.status).toBe(409);
  });

  it("GET resultado traz itens com calculado × informado", async () => {
    const r = await (await chamar(`/importacoes/${id}/resultado`, completa)).json();
    expect(r.total_notas).toBe(1);
    const nota = r.notas[0];
    expect(nota).toMatchObject({ chave_acesso: chEmitida, papel: "emitida", competencia: "2027-03" });
    expect(nota.itens[0].tributos.CBS).toEqual({ informado: 8.8, calculado: 0, diferenca: -8.8 });
    expect(nota.itens[1].tributos.IS).toEqual({ informado: 15, calculado: 15, diferenca: 0 });
  });

  it("chave restrita a outra empresa não vê a importação", async () => {
    expect((await chamar(`/importacoes/${id}`, soA2)).status).toBe(404);
  });

  it("POST JSON puro com ?cnpj → 202", async () => {
    const op = {
      id: `api-${n}`, dhFatoGerador: "2027-03-28T10:00:00-03:00", municipio: 4314902, uf: "RS",
      itens: [{ numero: 1, nbs: "122011200", cst: "200", cClassTrib: "200028", baseCalculo: 1000, aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 } }],
    };
    const r = await chamar(`/importacoes?cnpj=${CNPJ_A1}`, completa, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
    expect(r.status).toBe(202);
    expect((await aguardar((await r.json()).id, completa)).status).toBe("concluido");
  });

  it("registra o uso na auditoria", async () => {
    const { data } = await admin.from("auditoria").select("acao, entidade_id").eq("entidade_id", id);
    expect(data).toEqual([{ acao: "api.importar", entidade_id: id }]);
  });
});

describe("consultas", () => {
  it("GET apuracao: saldo = débito − crédito", async () => {
    const r = await (await chamar(`/apuracao?cnpj=${CNPJ_A1}&competencia=2027-03`, soConsulta)).json();
    for (const t of ["cbs", "ibs_uf", "ibs_mun"] as const) {
      expect(r.saldo[t]).toBeCloseTo(r.debito[t] - r.credito[t], 2);
    }
    expect(r.credito.is).toBe(0);
    expect(r.notas.emitidas).toBeGreaterThan(0);
    expect(r.calculadora).toMatch(/^1\.6\.1/);
  });

  it("GET divergencias: maior diferença primeiro e filtro por tributo", async () => {
    const r = await (await chamar(`/divergencias?cnpj=${CNPJ_A1}&competencia=2027-03&tributo=CBS`, soConsulta)).json();
    expect(r.total).toBeGreaterThan(0);
    const difs = r.itens.map((i: { diferenca: number }) => Math.abs(i.diferenca));
    expect(difs).toEqual([...difs].sort((a, b) => b - a));
    expect(r.itens.every((i: { tributo: string }) => i.tributo === "CBS")).toBe(true);
  });
});

describe("limite e documentação", () => {
  it("61ª requisição no mesmo minuto → 429 com Retry-After", async () => {
    const chave = await novaChave(["consultar"]);
    // Janela fixa por minuto de relógio: começa com folga para as 61 chamadas não atravessarem a virada do minuto
    const restante = 60 - new Date().getSeconds();
    if (restante < 15) await new Promise((r) => setTimeout(r, restante * 1000 + 500));
    let ultimo: Response | null = null;
    for (let i = 0; i < 61; i++) ultimo = await chamar(`/apuracao?cnpj=${CNPJ_A1}&competencia=2027-03`, chave);
    expect(ultimo!.status).toBe(429);
    expect(ultimo!.headers.get("retry-after")).toBe("60");
  }, 60_000);

  it("openapi.json é público e descreve os 5 endpoints", async () => {
    const r = await (await fetch(`${API}/openapi.json`)).json();
    expect(r.openapi).toBe("3.1.0");
    expect(Object.keys(r.paths).sort()).toEqual(["/apuracao", "/divergencias", "/importacoes", "/importacoes/{id}", "/importacoes/{id}/resultado"]);
    expect(r.components.securitySchemes.chaveApi.scheme).toBe("bearer");
  });
});
