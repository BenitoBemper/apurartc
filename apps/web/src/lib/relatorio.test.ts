import { describe, expect, it } from "vitest";
import { mesesAte, resumir, type LinhaTotal } from "./relatorio";

const linha = (p: Partial<LinhaTotal>): LinhaTotal => ({
  competencia: "2027-03-01", papel: "emitida", cbs_total: 0, ibs_uf_total: 0, ibs_mun_total: 0, is_total: 0,
  qtd_itens: 0, qtd_calculados: 0, ...p,
});

describe("resumir", () => {
  it("saldo = débito − crédito por tributo; IS não gera crédito", () => {
    const r = resumir([
      linha({ papel: "emitida", cbs_total: 155.76, ibs_uf_total: 0.88, ibs_mun_total: 0.88, is_total: 30, qtd_itens: 9, qtd_calculados: 7 }),
      linha({ papel: "recebida", cbs_total: 40.1, ibs_uf_total: 1.2, ibs_mun_total: 0.3, is_total: 15, qtd_itens: 2, qtd_calculados: 2 }),
    ], "2027-03");
    expect(r.debito).toEqual({ cbs: 155.76, ibsUf: 0.88, ibsMun: 0.88, is: 30 });
    expect(r.credito).toEqual({ cbs: 40.1, ibsUf: 1.2, ibsMun: 0.3, is: 0 });
    expect(r.saldo).toEqual({ cbs: 115.66, ibsUf: -0.32, ibsMun: 0.58, is: 30 });
    expect([r.qtdItens, r.qtdCalculados]).toEqual([11, 9]);
  });

  it("soma em centavos (sem erro de ponto flutuante)", () => {
    const r = resumir([linha({ cbs_total: 0.1 }), linha({ cbs_total: 0.2 }), linha({ papel: "recebida", cbs_total: 0.3 })], "2027-03");
    expect(r.debito.cbs).toBe(0.3);
    expect(r.saldo.cbs).toBe(0);
  });

  it("ignora outras competências e devolve zeros sem dados", () => {
    const r = resumir([linha({ competencia: "2027-02-01", cbs_total: 99 })], "2027-03");
    expect(r.saldo).toEqual({ cbs: 0, ibsUf: 0, ibsMun: 0, is: 0 });
  });
});

describe("mesesAte", () => {
  it("6 meses atravessando a virada do ano", () => {
    expect(mesesAte("2027-03", 6)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
  });
});
