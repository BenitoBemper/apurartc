// Exportação do relatório mensal: Excel (resumo + itens + divergências) e PDF (resumo para o cliente).
import "server-only";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@apurartc/db";
import type { DadosRelatorio, Resumo } from "./relatorio";
import { formatarCnpj, formatarCompetencia } from "./formatos";

export const LIMITE_LINHAS = 50_000;

export type LinhaItem = {
  documento_numero: string | null;
  chave_acesso: string | null;
  papel: "emitida" | "recebida" | null;
  item_numero: number | null;
  ncm: string | null;
  nbs: string | null;
  cclasstrib: string | null;
  estado_item: string | null;
  tributo: string | null;
  informado: number | null;
  calculado: number | null;
  diferenca: number | null;
};

/** Itens × tributo da competência (até LIMITE_LINHAS, em páginas de 1.000). */
export async function obterItens(sb: SupabaseClient<Database>, empresaId: string, competencia: string): Promise<{ linhas: LinhaItem[]; truncado: boolean }> {
  const linhas: LinhaItem[] = [];
  for (let de = 0; de < LIMITE_LINHAS; de += 1000) {
    const { data, error } = await sb.from("vw_divergencias")
      .select("documento_numero, chave_acesso, papel, item_numero, ncm, nbs, cclasstrib, estado_item, tributo, informado, calculado, diferenca")
      .eq("empresa_id", empresaId).eq("competencia", `${competencia}-01`)
      .order("papel").order("documento_numero").order("item_numero").order("tributo")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    linhas.push(...((data ?? []) as LinhaItem[]));
    if (!data || data.length < 1000) return { linhas, truncado: false };
  }
  return { linhas, truncado: true };
}

const TRIBUTOS: [keyof Resumo["debito"], string][] = [["cbs", "CBS"], ["ibsUf", "IBS estadual"], ["ibsMun", "IBS municipal"], ["is", "Imposto Seletivo"]];
const ROTULO_TRIBUTO: Record<string, string> = { CBS: "CBS", IBS_UF: "IBS estadual", IBS_MUN: "IBS municipal", IS: "Imposto Seletivo" };
const PAPEL: Record<string, string> = { emitida: "Emitida (débito)", recebida: "Recebida (crédito)" };
const MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

export async function gerarExcel(d: DadosRelatorio, itens: { linhas: LinhaItem[]; truncado: boolean }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ApuraRTC";
  wb.created = new Date();

  const r = wb.addWorksheet("Resumo");
  r.columns = [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 18 }];
  r.addRow(["ApuraRTC — Relatório mensal IBS/CBS"]).font = { bold: true, size: 14 };
  r.addRow([`${d.empresa.razao_social} · CNPJ ${formatarCnpj(d.empresa.cnpj)}`]);
  r.addRow([`Competência ${formatarCompetencia(d.resumo.competencia)}`]);
  r.addRow([]);
  const cab = r.addRow(["Tributo", "Débito (emitidas)", "Crédito (recebidas)", "Saldo"]);
  cab.font = { bold: true };
  for (const [k, rot] of TRIBUTOS) {
    const l = r.addRow([rot, d.resumo.debito[k], k === "is" ? null : d.resumo.credito[k], d.resumo.saldo[k]]);
    [2, 3, 4].forEach((c) => (l.getCell(c).numFmt = MOEDA));
  }
  r.addRow([]);
  r.addRow(["Notas emitidas", d.notas.emitidas]);
  r.addRow(["Notas recebidas", d.notas.recebidas]);
  r.addRow(["Itens calculados", `${d.resumo.qtdCalculados} de ${d.resumo.qtdItens}`]);
  r.addRow(["Divergências (ERP × calculadora)", d.divergencias]);
  r.addRow(["Calculadora oficial", d.versaoCalculadora ?? "—"]);
  r.addRow([]);
  r.addRow(["Saldo positivo = a recolher; negativo = saldo credor. Valores calculados pela calculadora oficial da RFB."]).font = { italic: true };

  const h = wb.addWorksheet("Histórico");
  h.columns = [{ header: "Competência", width: 14 }, ...TRIBUTOS.map(([, rot]) => ({ header: `Saldo ${rot}`, width: 20 }))];
  h.getRow(1).font = { bold: true };
  for (const m of d.historico) {
    const l = h.addRow([formatarCompetencia(m.competencia), ...TRIBUTOS.map(([k]) => m.saldo[k])]);
    for (let c = 2; c <= 5; c++) l.getCell(c).numFmt = MOEDA;
  }

  const colunas = [
    { header: "Nota", key: "nota", width: 14 }, { header: "Chave de acesso", key: "chave", width: 48 },
    { header: "Papel", key: "papel", width: 18 }, { header: "Item", key: "item", width: 6 },
    { header: "NCM/NBS", key: "codigo", width: 12 }, { header: "cClassTrib", key: "cclass", width: 11 },
    { header: "Situação", key: "estado", width: 22 }, { header: "Tributo", key: "tributo", width: 16 },
    { header: "Informado (ERP)", key: "inf", width: 16, style: { numFmt: MOEDA } },
    { header: "Calculado", key: "calc", width: 16, style: { numFmt: MOEDA } },
    { header: "Diferença", key: "dif", width: 16, style: { numFmt: MOEDA } },
  ];
  const paraLinha = (l: LinhaItem) => ({
    nota: l.documento_numero, chave: l.chave_acesso, papel: PAPEL[l.papel ?? ""] ?? "", item: l.item_numero,
    codigo: l.ncm ?? l.nbs, cclass: l.cclasstrib, estado: l.estado_item, tributo: ROTULO_TRIBUTO[l.tributo ?? ""] ?? l.tributo,
    inf: l.informado === null ? null : Number(l.informado), calc: l.calculado === null ? null : Number(l.calculado),
    dif: l.diferenca === null ? null : Number(l.diferenca),
  });

  const it = wb.addWorksheet("Itens");
  it.columns = colunas;
  it.getRow(1).font = { bold: true };
  it.views = [{ state: "frozen", ySplit: 1 }];
  itens.linhas.forEach((l) => it.addRow(paraLinha(l)));
  if (itens.truncado) it.addRow({ nota: `Limite de ${LIMITE_LINHAS} linhas atingido: exporte por período menor.` });
  it.autoFilter = { from: "A1", to: "K1" };

  const dv = wb.addWorksheet("Divergências");
  dv.columns = colunas;
  dv.getRow(1).font = { bold: true };
  dv.views = [{ state: "frozen", ySplit: 1 }];
  itens.linhas
    .filter((l) => l.diferenca !== null && Math.abs(Number(l.diferenca)) >= 0.01)
    .sort((a, b) => Math.abs(Number(b.diferenca)) - Math.abs(Number(a.diferenca)))
    .forEach((l) => dv.addRow(paraLinha(l)));
  dv.autoFilter = { from: "A1", to: "K1" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function gerarPdf(d: DadosRelatorio): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `ApuraRTC ${d.resumo.competencia}`, Author: "ApuraRTC" } });
    const partes: Buffer[] = [];
    doc.on("data", (b: Buffer) => partes.push(b));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text("Relatório mensal IBS/CBS");
    doc.font("Helvetica").fontSize(11).fillColor("#444")
      .text(`${d.empresa.razao_social} · CNPJ ${formatarCnpj(d.empresa.cnpj)}`)
      .text(`Competência ${formatarCompetencia(d.resumo.competencia)} · emitido em ${new Date().toLocaleString("pt-BR")}`);
    doc.moveDown(1.5).fillColor("#000");

    // Tabela débito × crédito × saldo
    const x = [50, 210, 320, 430];
    const larg = [150, 100, 100, 115];
    const linha = (cols: string[], negrito = false) => {
      const y = doc.y;
      doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(10);
      cols.forEach((c, i) => doc.text(c, x[i], y, { width: larg[i], align: i === 0 ? "left" : "right" }));
      doc.moveDown(0.6);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ddd").stroke();
      doc.moveDown(0.4);
    };
    linha(["Tributo", "Débito (emitidas)", "Crédito (recebidas)", "Saldo"], true);
    for (const [k, rot] of TRIBUTOS) {
      linha([rot, brl(d.resumo.debito[k]), k === "is" ? "—" : brl(d.resumo.credito[k]), brl(d.resumo.saldo[k])]);
    }
    doc.x = 50;
    doc.moveDown(1).font("Helvetica").fontSize(10)
      .text(`Notas: ${d.notas.emitidas} emitidas e ${d.notas.recebidas} recebidas.`)
      .text(`Itens calculados: ${d.resumo.qtdCalculados} de ${d.resumo.qtdItens}. Divergências ERP × calculadora: ${d.divergencias}.`);

    doc.moveDown(1.5).font("Helvetica-Bold").fontSize(12).text("Saldo dos últimos 6 meses");
    doc.moveDown(0.5);
    linha(["Competência", "CBS", "IBS (UF + Mun.)", "IS"], true);
    for (const m of d.historico) {
      linha([formatarCompetencia(m.competencia), brl(m.saldo.cbs), brl((Math.round(m.saldo.ibsUf * 100) + Math.round(m.saldo.ibsMun * 100)) / 100), brl(m.saldo.is)]);
    }

    doc.x = 50;
    doc.moveDown(2).font("Helvetica").fontSize(8).fillColor("#666").text(
      `Saldo positivo = valor a recolher; negativo = saldo credor. Valores calculados pela calculadora oficial da Receita Federal` +
        `${d.versaoCalculadora ? ` (versão ${d.versaoCalculadora})` : ""}, sem modificação. Documento gerado pelo ApuraRTC; ` +
        `não substitui a apuração oficial.`,
      { width: 495 },
    );
    doc.end();
  });
}
