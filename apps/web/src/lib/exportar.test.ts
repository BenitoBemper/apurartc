import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { gerarExcel, gerarPdf, type LinhaItem } from "./exportar";
import { resumir, type DadosRelatorio } from "./relatorio";

const resumo = resumir([
  { competencia: "2027-03-01", papel: "emitida", cbs_total: 100, ibs_uf_total: 10, ibs_mun_total: 5, is_total: 15, qtd_itens: 3, qtd_calculados: 2 },
  { competencia: "2027-03-01", papel: "recebida", cbs_total: 30, ibs_uf_total: 12, ibs_mun_total: 1, is_total: 0, qtd_itens: 1, qtd_calculados: 1 },
], "2027-03");

const dados: DadosRelatorio = {
  empresa: { id: "e1", cnpj: "12345678000195", razao_social: "Empresa Ação & Cia Ltda" },
  resumo,
  historico: [resumir([], "2027-02"), resumo],
  notas: { emitidas: 2, recebidas: 1 },
  divergencias: 1,
  versaoCalculadora: "1.6.1 (base V0059)",
};

const item = (p: Partial<LinhaItem>): LinhaItem => ({
  documento_numero: "77", chave_acesso: "4".repeat(44), papel: "emitida", item_numero: 1, ncm: "10063021", nbs: null,
  cclasstrib: "200003", estado_item: "CALCULO_SIMULADO", tributo: "CBS", informado: null, calculado: 0, diferenca: null, ...p,
});

describe("gerarExcel", () => {
  it("abas Resumo, Histórico, Itens e Divergências com os valores", async () => {
    const buf = await gerarExcel(dados, {
      truncado: false,
      linhas: [
        item({ tributo: "CBS", informado: 8.8, calculado: 0, diferenca: -8.8 }),
        item({ tributo: "IBS_UF", informado: 0, calculado: 0, diferenca: 0 }),
        item({ item_numero: 2, tributo: "CBS", informado: null, calculado: 14.52 }),
      ],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumo", "Histórico", "Itens", "Divergências"]);

    const r = wb.getWorksheet("Resumo")!;
    expect(r.getCell("A2").value).toBe("Empresa Ação & Cia Ltda · CNPJ 12.345.678/0001-95");
    // linha 6 = CBS: débito 100, crédito 30, saldo 70; linha 7 = IBS UF: saldo −2 (credor)
    expect([r.getCell("B6").value, r.getCell("C6").value, r.getCell("D6").value]).toEqual([100, 30, 70]);
    expect(r.getCell("D7").value).toBe(-2);
    expect(r.getCell("C9").value).toBeNull(); // IS sem crédito

    expect(wb.getWorksheet("Itens")!.rowCount).toBe(4); // cabeçalho + 3
    const dv = wb.getWorksheet("Divergências")!;
    expect(dv.rowCount).toBe(2);
    expect(dv.getRow(2).getCell(11).value).toBe(-8.8);
  });
});

describe("gerarPdf", () => {
  it("gera um PDF de 1 página com acentos", async () => {
    const buf = await gerarPdf(dados);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
    const arquivo = join(process.env.PDF_SAIDA ?? tmpdir(), "relatorio-teste.pdf");
    writeFileSync(arquivo, buf); // para inspeção visual
  });
});
