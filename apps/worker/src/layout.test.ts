import { describe, expect, it } from "vitest";
import { paraCalculadora, validarArquivo } from "./layout.js";
import { competenciaDe } from "./processar.js";

const op = {
  id: "teste",
  dhFatoGerador: "2027-03-10T10:00:00-03:00",
  municipio: 4314902,
  uf: "RS",
  chaveAcesso: "4".repeat(44),
  itens: [
    {
      numero: 1, ncm: "10063021", cst: "200", cClassTrib: "200003", baseCalculo: 100,
      aliquotasNominais: { cbs: 8.8 }, informado: { cbs: 1.5, ibsUf: "0.10" },
    },
  ],
};

describe("validarArquivo", () => {
  it("aceita uma operação ou uma lista", () => {
    const um = validarArquivo(JSON.stringify(op));
    const lista = validarArquivo(JSON.stringify([op, { ...op, id: "2" }]));
    expect(um.ok && um.operacoes).toHaveLength(1);
    expect(lista.ok && lista.operacoes).toHaveLength(2);
  });

  it("converte informado em número e mantém campos da calculadora", () => {
    const r = validarArquivo(JSON.stringify(op));
    if (!r.ok) throw new Error("deveria ser válido");
    expect(r.operacoes[0].itens[0].informado).toEqual({ cbs: 1.5, ibsUf: 0.1 });
    expect(r.operacoes[0].itens[0]).toHaveProperty("aliquotasNominais");
  });

  it("aceita BOM no início do arquivo", () => {
    expect(validarArquivo("﻿" + JSON.stringify(op)).ok).toBe(true);
  });

  it("aponta o campo com erro (JSON Pointer)", () => {
    const ruim = { ...op, uf: "rs", itens: [{ ...op.itens[0], cst: "2" }] };
    const r = validarArquivo(JSON.stringify(ruim));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.map((e) => e.campo)).toEqual(expect.arrayContaining(["#/uf", "#/itens/0/cst"]));
  });

  it("em lista, o caminho inclui o índice da operação", () => {
    const r = validarArquivo(JSON.stringify([op, { ...op, municipio: 12 }]));
    expect(!r.ok && r.erros[0].campo).toBe("#/1/municipio");
  });

  it("exige ncm ou nbs e números de item únicos", () => {
    const semCodigo = { numero: 2, cst: "000", cClassTrib: "000001" };
    const r = validarArquivo(JSON.stringify({ ...op, itens: [op.itens[0], op.itens[0], semCodigo] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const msgs = r.erros.map((e) => e.mensagem).join(" | ");
    expect(msgs).toContain("item 1 repetido");
    expect(msgs).toContain("informe ncm");
  });

  it("versao padrão 1.0.0 e id obrigatório (exigidos pela calculadora)", () => {
    const r = validarArquivo(JSON.stringify(op));
    expect(r.ok && r.operacoes[0].versao).toBe("1.0.0");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...semId } = op;
    const r2 = validarArquivo(JSON.stringify(semId));
    expect(!r2.ok && r2.erros[0]).toMatchObject({ campo: "#/id" });
  });

  it("rejeita JSON quebrado e data sem fuso", () => {
    expect(validarArquivo("{").ok).toBe(false);
    const r = validarArquivo(JSON.stringify({ ...op, dhFatoGerador: "2027-03-10T10:00:00" }));
    expect(!r.ok && r.erros[0].campo).toBe("#/dhFatoGerador");
  });
});

describe("paraCalculadora", () => {
  it("remove os campos exclusivos do ApuraRTC", () => {
    const r = validarArquivo(JSON.stringify(op));
    if (!r.ok) throw new Error();
    const corpo = paraCalculadora(r.operacoes[0]) as { chaveAcesso?: string; itens: Record<string, unknown>[] };
    expect(corpo.chaveAcesso).toBeUndefined();
    expect(corpo.itens[0].informado).toBeUndefined();
    expect(corpo.itens[0].cClassTrib).toBe("200003");
  });
});

describe("competenciaDe", () => {
  it("usa o fuso de Brasília", () => {
    expect(competenciaDe("2027-03-31T23:30:00-03:00")).toBe("2027-03-01");
    expect(competenciaDe("2027-04-01T01:00:00Z")).toBe("2027-03-01");
    expect(competenciaDe("2027-04-01T03:00:00Z")).toBe("2027-04-01");
  });
});
