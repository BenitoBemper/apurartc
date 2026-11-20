import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { lerXml, lerZip } from "./xml.js";
import { paraCalculadora } from "./layout.js";
import { ARROZ, CERVEJA, chaveTeste, nfe, nfeProc, procEventoCancelamento } from "../e2e/fixtures/nfe.js";

const EMPRESA = "12345678000195";
const OUTRA = "98765432000198";
const base = { dhEmi: "2027-03-12T10:00:00-03:00", cMunFG: "4314902", cnpjEmit: EMPRESA, cnpjDest: OUTRA };

describe("lerXml", () => {
  it("converte nfeProc em OperacaoInput com valores informados", () => {
    const chave = chaveTeste(EMPRESA, 1);
    const r = lerXml("a.xml", nfeProc({ ...base, chave, nNF: "77", serie: "2", itens: [ARROZ, CERVEJA] }), EMPRESA);
    expect(r.erros).toEqual([]);
    expect(r.notas).toHaveLength(1);
    const n = r.notas[0];
    expect(n).toMatchObject({ chave, modelo: "55", papel: "emitida", arquivo: "a.xml" });
    expect(n.xmlNFe).toMatch(/^<NFe[\s>]/);
    expect(n.operacao).toMatchObject({
      id: chave, chaveAcesso: chave, numero: "77", serie: "2", tipoDfe: "NFE", versao: "1.0.0",
      dhFatoGerador: "2027-03-12T10:00:00-03:00", municipio: 4314902, uf: "RS",
    });
    const [arroz, cerveja] = n.operacao.itens;
    expect(arroz).toMatchObject({
      numero: 1, ncm: "10063021", cst: "200", cClassTrib: "200003", baseCalculo: 100, quantidade: 20, unidade: "KG",
      aliquotasNominais: { cbs: 8.8, ibsEstadual: 0.05, ibsMunicipal: 0.05 },
      informado: { cbs: 8.8, ibsUf: 0, ibsMun: 0 },
    });
    // com IS: sem baseCalculo (a calculadora deriva da base do IS)
    expect(cerveja).not.toHaveProperty("baseCalculo");
    expect(cerveja).toMatchObject({
      impostoSeletivo: { cst: "000", cClassTrib: "000001", baseCalculo: 150, quantidade: 12, unidade: "LT", impostoInformado: 15 },
      aliquotasNominais: { impostoSeletivo: { adValorem: 10 } },
      informado: { cbs: 14.52, is: 15 },
    });
    // campos do ApuraRTC não vão para a calculadora
    const corpo = paraCalculadora(n.operacao) as Record<string, unknown> & { itens: Record<string, unknown>[] };
    expect(corpo.chaveAcesso).toBeUndefined();
    expect(corpo.itens[0].informado).toBeUndefined();
  });

  it("nota recebida: a empresa é a destinatária", () => {
    const r = lerXml("b.xml", nfeProc({ ...base, cnpjEmit: OUTRA, cnpjDest: EMPRESA, chave: chaveTeste(OUTRA, 5), itens: [ARROZ] }), EMPRESA);
    expect(r.notas[0].papel).toBe("recebida");
  });

  it("rejeita nota de outra empresa", () => {
    const r = lerXml("c.xml", nfeProc({ ...base, cnpjEmit: OUTRA, cnpjDest: "11222333000181", chave: chaveTeste(OUTRA, 6), itens: [ARROZ] }), EMPRESA);
    expect(r.notas).toEqual([]);
    expect(r.erros[0].mensagem).toMatch(/não pertence à empresa/);
  });

  it("antes de 2027 não envia alíquotas (a calculadora proíbe)", () => {
    const r = lerXml("d.xml", nfeProc({ ...base, dhEmi: "2026-06-01T10:00:00-03:00", chave: chaveTeste(EMPRESA, 7, "55", "2606"), itens: [ARROZ] }), EMPRESA);
    expect(r.notas[0].operacao.itens[0]).not.toHaveProperty("aliquotasNominais");
  });

  it("NFC-e (mod. 65) sem destinatário", () => {
    const r = lerXml("e.xml", nfe({ ...base, cnpjDest: undefined, modelo: "65", chave: chaveTeste(EMPRESA, 8, "65"), itens: [ARROZ] }), EMPRESA);
    expect(r.notas[0]).toMatchObject({ modelo: "65", papel: "emitida", operacao: { tipoDfe: "NFCE" } });
  });

  it("lote enviNFe com duas notas", () => {
    const xml = `<enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote><indSinc>1</indSinc>` +
      nfe({ ...base, chave: chaveTeste(EMPRESA, 9), itens: [ARROZ] }) + nfe({ ...base, chave: chaveTeste(EMPRESA, 10), itens: [CERVEJA] }) + `</enviNFe>`;
    const r = lerXml("lote.xml", xml, EMPRESA);
    expect(r.notas.map((n) => n.chave)).toEqual([chaveTeste(EMPRESA, 9), chaveTeste(EMPRESA, 10)]);
    expect(r.notas[1].xmlNFe).toContain(chaveTeste(EMPRESA, 10));
  });

  it("evento de cancelamento vira aviso; XML quebrado e item sem IBSCBS viram erro", () => {
    expect(lerXml("ev.xml", procEventoCancelamento("1".repeat(44)), EMPRESA).avisos[0].mensagem).toMatch(/evento/);
    expect(lerXml("q.xml", "<NFe><infNFe>", EMPRESA).erros.length).toBeGreaterThan(0);
    const semGrupo = nfeProc({ ...base, chave: chaveTeste(EMPRESA, 11), itens: [ARROZ] }).replace(/<IBSCBS>[\s\S]*<\/IBSCBS>/, "");
    expect(lerXml("s.xml", semGrupo, EMPRESA).erros[0].mensagem).toMatch(/sem grupo IBSCBS/);
  });
});

describe("lerZip", () => {
  it("lê os XMLs do ZIP e ignora outros arquivos", () => {
    const zip = zipSync({
      "notas/1.xml": strToU8(nfeProc({ ...base, chave: chaveTeste(EMPRESA, 21), itens: [ARROZ] })),
      "notas/2.XML": strToU8(nfeProc({ ...base, chave: chaveTeste(EMPRESA, 22), itens: [CERVEJA] })),
      "notas/cancelamento.xml": strToU8(procEventoCancelamento(chaveTeste(EMPRESA, 21))),
      "leiame.txt": strToU8("ignorar"),
    });
    const r = lerZip(zip, EMPRESA);
    expect(r.notas.map((n) => n.arquivo)).toEqual(["notas/1.xml", "notas/2.XML"]);
    expect(r.avisos).toHaveLength(1);
    expect(r.erros).toEqual([]);
  });

  it("ZIP inválido ou sem XML", () => {
    expect(lerZip(strToU8("não é zip"), EMPRESA).erros[0].mensagem).toMatch(/ZIP inválido/);
    expect(lerZip(zipSync({ "a.txt": strToU8("x") }), EMPRESA).erros[0].mensagem).toMatch(/não contém/);
  });
});
