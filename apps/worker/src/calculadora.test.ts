import { afterEach, describe, expect, it, vi } from "vitest";
import { calcular, ErroCalculadora, lerObjeto } from "./calculadora.js";

describe("calcular — rejeição 422", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("converte o problem+json em erros legíveis e não retenta", async () => {
    const corpo = {
      title: "Erros no processamento do cálculo", status: 422, detail: "O cálculo contém 1 erro(s).",
      errors: [{ code: "VAL-001", title: "Campo obrigatório não informado", pointer: "#/versao", detail: "Campo 'versao' must not be null" }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(corpo), { status: 422 })));
    const e = await calcular("http://calc", {}).catch((x) => x);
    expect(e).toBeInstanceOf(ErroCalculadora);
    expect(e.transitorio).toBe(false);
    expect(e.message).toBe("A calculadora rejeitou a operação: O cálculo contém 1 erro(s).");
    expect(e.erros).toEqual([
      { codigo: "VAL-001", campo: "#/versao", mensagem: "Campo obrigatório não informado: Campo 'versao' must not be null" },
    ]);
  });

  it("5xx e falha de rede são temporários (retentar)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    expect((await calcular("http://calc", {}).catch((x) => x)).transitorio).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect((await calcular("http://calc", {}).catch((x) => x)).transitorio).toBe(true);
  });
});

// Trechos reais da resposta da calculadora 1.6.1 para docs/exemplos.md
describe("lerObjeto", () => {
  it("usa a alíquota efetiva quando há redução", () => {
    const r = lerObjeto({
      nObj: 3, estadoItem: "CALCULO_SIMULADO",
      tribCalc: { IBSCBS: { gIBSCBS: {
        gIBSUF: { pIBSUF: "0.05", gRed: { pAliqEfet: "0.02" }, vIBSUF: "0.24" },
        gIBSMun: { pIBSMun: "0.05", gRed: { pAliqEfet: "0.02" }, vIBSMun: "0.24" },
        gCBS: { pCBS: "8.80", gRed: { pAliqEfet: "3.52" }, vCBS: "42.24" },
      } } },
    });
    expect(r).toMatchObject({
      estado: "CALCULO_SIMULADO", cbs_aliquota: 3.52, cbs_valor: 42.24,
      ibs_uf_aliquota: 0.02, ibs_uf_valor: 0.24, ibs_mun_valor: 0.24, is_valor: null, erros: [],
    });
  });

  it("lê o Imposto Seletivo e a alíquota cheia sem redução", () => {
    const r = lerObjeto({
      nObj: 2, estadoItem: "CALCULO_SIMULADO",
      tribCalc: {
        IS: { pIS: "10.00", vIS: "15.00" },
        IBSCBS: { gIBSCBS: { gCBS: { pCBS: "8.80", vCBS: "14.52" } } },
      },
    });
    expect(r).toMatchObject({ is_aliquota: 10, is_valor: 15, cbs_aliquota: 8.8, cbs_valor: 14.52 });
  });

  it("converte os erros do item", () => {
    const r = lerObjeto({
      nObj: 4, estadoItem: "INCONSISTENCIA_ENTRADA",
      erros: [{ code: "REG-011", title: "NCM não vinculada", pointer: "#/itens/3/ncm", detail: "NCM 02013000…" }],
    });
    expect(r.estado).toBe("INCONSISTENCIA_ENTRADA");
    expect(r.cbs_valor).toBeNull();
    expect(r.erros).toEqual([{ codigo: "REG-011", campo: "#/itens/3/ncm", mensagem: "NCM não vinculada: NCM 02013000…" }]);
  });

  it("estado desconhecido vira FALHA_TECNICA", () => {
    expect(lerObjeto({ nObj: 1, estadoItem: "NOVO_ESTADO" }).estado).toBe("FALHA_TECNICA");
  });
});
