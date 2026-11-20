// Leitura de XML de NF-e (mod. 55) e NFC-e (mod. 65) no layout da Reforma Tributária e conversão para OperacaoInput.
// Aceita NFe, nfeProc (nota autorizada) e enviNFe (lote). Eventos (cancelamento etc.) são ignorados com aviso.
import { XMLParser } from "fast-xml-parser";
import { unzipSync, strFromU8 } from "fflate";
import { operacaoSchema, type ErroLayout, type Operacao } from "./layout.js";

export type PapelNota = "emitida" | "recebida";

export type NotaConvertida = {
  arquivo: string;
  chave: string;
  modelo: "55" | "65";
  papel: PapelNota;
  operacao: Operacao;
  xmlNFe: string; // <NFe> isolada, para o validador oficial
};

export type ResultadoLeitura = {
  notas: NotaConvertida[];
  erros: (ErroLayout & { arquivo: string })[];
  avisos: { arquivo: string; mensagem: string }[];
};

/** Código IBGE da UF (2 primeiros dígitos do município) → sigla */
const UF_POR_CODIGO: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI",
  "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES",
  "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false, // mantém "00", NCM com zeros à esquerda etc.
  trimValues: true,
  isArray: (nome) => nome === "det" || nome === "NFe",
});

type No = Record<string, unknown>;
const no = (v: unknown): No | undefined => (v && typeof v === "object" ? (v as No) : undefined);
const txt = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const dec = (v: unknown): number | undefined => (txt(v) === undefined ? undefined : Number(v));

/** Separa as <NFe> do texto original (para validar cada nota no XSD oficial). */
function extrairNFes(xml: string): string[] {
  return xml.match(/<(?:\w+:)?NFe[\s>][\s\S]*?<\/(?:\w+:)?NFe>/g) ?? [];
}

/** Lê um arquivo XML (pode conter várias NF-e num enviNFe). */
export function lerXml(arquivo: string, conteudo: string, cnpjEmpresa: string): ResultadoLeitura {
  const r: ResultadoLeitura = { notas: [], erros: [], avisos: [] };
  let doc: No;
  try {
    doc = parser.parse(conteudo.replace(/^﻿/, "")) as No;
  } catch (e) {
    r.erros.push({ arquivo, campo: "#", mensagem: `XML mal formado: ${(e as Error).message}` });
    return r;
  }

  const raiz = Object.keys(doc).find((k) => k !== "?xml") ?? "";
  let nfes: No[] = [];
  if (raiz === "NFe") nfes = (doc.NFe as No[]) ?? [];
  else if (raiz === "nfeProc" || raiz === "enviNFe") nfes = (no(doc[raiz])?.NFe as No[]) ?? [];
  else if (/evento|retEnvi|retCons|inutNFe|procInut/i.test(raiz)) {
    r.avisos.push({ arquivo, mensagem: `arquivo de evento/retorno (${raiz}) ignorado: não é uma nota` });
    return r;
  } else {
    r.erros.push({ arquivo, campo: "#", mensagem: `raiz <${raiz || "?"}> não é NF-e/NFC-e` });
    return r;
  }

  const textos = extrairNFes(conteudo);
  nfes.forEach((nfe, i) => {
    const res = converterNFe(no(nfe.infNFe) ?? {}, cnpjEmpresa);
    if ("erros" in res) {
      r.erros.push(...res.erros.map((e) => ({ ...e, arquivo })));
      return;
    }
    r.notas.push({ ...res, arquivo, xmlNFe: textos[i] ?? "" });
  });
  return r;
}

/** Lê um ZIP com XMLs (ignora pastas e arquivos que não são .xml). */
export function lerZip(dados: Uint8Array, cnpjEmpresa: string, limiteArquivos = 5000): ResultadoLeitura {
  const r: ResultadoLeitura = { notas: [], erros: [], avisos: [] };
  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(dados, { filter: (f) => /\.xml$/i.test(f.name) && !f.name.startsWith("__MACOSX/") });
  } catch (e) {
    r.erros.push({ arquivo: "(zip)", campo: "#", mensagem: `ZIP inválido: ${(e as Error).message}` });
    return r;
  }
  const nomes = Object.keys(entradas).sort();
  if (nomes.length === 0) r.erros.push({ arquivo: "(zip)", campo: "#", mensagem: "o ZIP não contém arquivos .xml" });
  if (nomes.length > limiteArquivos) {
    r.erros.push({ arquivo: "(zip)", campo: "#", mensagem: `máximo de ${limiteArquivos} XMLs por ZIP (enviados: ${nomes.length})` });
    return r;
  }
  for (const nome of nomes) {
    const parcial = lerXml(nome, strFromU8(entradas[nome]), cnpjEmpresa);
    r.notas.push(...parcial.notas);
    r.erros.push(...parcial.erros);
    r.avisos.push(...parcial.avisos);
  }
  return r;
}

type Convertida = Omit<NotaConvertida, "arquivo" | "xmlNFe">;

export function converterNFe(inf: No, cnpjEmpresa: string): Convertida | { erros: ErroLayout[] } {
  const erros: ErroLayout[] = [];
  const ide = no(inf.ide) ?? {};
  const chave = (txt(inf["@_Id"]) ?? "").replace(/^NFe/, "");
  const modelo = txt(ide.mod);
  if (modelo !== "55" && modelo !== "65") return { erros: [{ campo: "#/ide/mod", mensagem: `modelo ${modelo ?? "?"} não suportado (55 ou 65)` }] };

  const cnpjEmit = txt(no(inf.emit)?.CNPJ);
  const cnpjDest = txt(no(inf.dest)?.CNPJ);
  let papel: PapelNota;
  if (cnpjEmit === cnpjEmpresa) papel = "emitida";
  else if (cnpjDest === cnpjEmpresa) papel = "recebida";
  else {
    return {
      erros: [{ campo: "#/emit/CNPJ", mensagem: `nota ${chave || "?"} não pertence à empresa selecionada (emitente ${cnpjEmit ?? "?"}, destinatário ${cnpjDest ?? "sem CNPJ"})` }],
    };
  }

  const dhEmi = txt(ide.dhEmi) ?? "";
  const anoFato = Number(dhEmi.slice(0, 4));
  const comAliquotas = anoFato >= 2027; // antes de 2027 a calculadora proíbe aliquotasNominais
  const municipio = txt(ide.cMunFGIBS) ?? txt(ide.cMunFG) ?? "";
  const uf = UF_POR_CODIGO[municipio.slice(0, 2)] ?? "";

  const dets = (inf.det as No[] | undefined) ?? [];
  const itens = dets.map((det) => {
    const nItem = Number(det["@_nItem"]);
    const prod = no(det.prod) ?? {};
    const imp = no(det.imposto) ?? {};
    const ibscbs = no(imp.IBSCBS);
    const g = no(ibscbs?.gIBSCBS);
    const gUF = no(g?.gIBSUF);
    const gMun = no(g?.gIBSMun);
    const gCBS = no(g?.gCBS);
    const is = no(imp.IS);
    if (!ibscbs) erros.push({ campo: `#/det/${nItem}/imposto/IBSCBS`, mensagem: `item ${nItem} sem grupo IBSCBS` });

    const item: Record<string, unknown> = {
      numero: nItem,
      ncm: txt(prod.NCM),
      cst: txt(ibscbs?.CST),
      cClassTrib: txt(ibscbs?.cClassTrib),
      quantidade: dec(prod.qCom),
      unidade: txt(prod.uCom),
      informado: {
        cbs: dec(gCBS?.vCBS),
        ibsUf: dec(gUF?.vIBSUF),
        ibsMun: dec(gMun?.vIBSMun),
        is: dec(is?.vIS),
      },
    };
    if (is) {
      // Com IS, a base de CBS/IBS é derivada pela calculadora (base do IS + IS)
      item.impostoSeletivo = {
        cst: txt(is.CSTIS), cClassTrib: txt(is.cClassTribIS), baseCalculo: dec(is.vBCIS),
        quantidade: dec(is.qTrib), unidade: txt(is.uTrib), impostoInformado: dec(is.vIS),
      };
    } else {
      item.baseCalculo = dec(g?.vBC);
    }
    if (comAliquotas) {
      item.aliquotasNominais = {
        cbs: dec(gCBS?.pCBS), ibsEstadual: dec(gUF?.pIBSUF), ibsMunicipal: dec(gMun?.pIBSMun),
        ...(is ? { impostoSeletivo: { adValorem: dec(is.pIS), adRem: dec(is.pISEspec) } } : {}),
      };
    }
    return limpar(item);
  });
  if (erros.length) return { erros };

  const bruto = {
    id: chave || `${txt(ide.serie)}-${txt(ide.nNF)}`,
    dhFatoGerador: dhEmi,
    municipio: Number(municipio),
    uf,
    chaveAcesso: chave || undefined,
    numero: txt(ide.nNF),
    serie: txt(ide.serie),
    tipoDfe: modelo === "55" ? "NFE" : "NFCE",
    itens,
  };
  const v = operacaoSchema.safeParse(limpar(bruto));
  if (!v.success) {
    return { erros: v.error.issues.map((i) => ({ campo: "#/" + i.path.join("/"), mensagem: `nota ${chave}: ${i.message}` })) };
  }
  return { chave, modelo, papel, operacao: v.data };
}

/** Remove chaves undefined (recursivo) e objetos vazios. */
function limpar<T>(v: T): T {
  if (Array.isArray(v)) return v.map(limpar) as T;
  if (v && typeof v === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const l = limpar(val);
      if (l === undefined) continue;
      if (l && typeof l === "object" && !Array.isArray(l) && Object.keys(l).length === 0) continue;
      saida[k] = l;
    }
    return saida as T;
  }
  return v;
}
