// Layout de entrada JSON do ApuraRTC = OperacaoInput da calculadora + campos opcionais do ApuraRTC.
// Aceita uma operação (nota) ou uma lista de operações.
//   Nota:  chaveAcesso, numero, serie, tipoDfe        (não vão para a calculadora)
//   Item:  informado { cbs, ibsUf, ibsMun, is }        (valores do ERP, para a divergência)
import { z } from "zod";

const numero = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);

export const informadoSchema = z
  .object({ cbs: numero.optional(), ibsUf: numero.optional(), ibsMun: numero.optional(), is: numero.optional() })
  .strict();

export const itemSchema = z
  .object({
    numero: z.number().int().positive(),
    ncm: z.string().regex(/^\d{8}$/, "NCM deve ter 8 dígitos").optional(),
    nbs: z.string().regex(/^\d{9}$/, "NBS deve ter 9 dígitos").optional(),
    cst: z.string().regex(/^\d{3}$/, "CST deve ter 3 dígitos"),
    cClassTrib: z.string().regex(/^\d{6}$/, "cClassTrib deve ter 6 dígitos"),
    baseCalculo: z.number().nonnegative().optional(),
    quantidade: z.number().nonnegative().optional(),
    unidade: z.string().max(6).optional(),
    informado: informadoSchema.optional(),
  })
  .passthrough(); // impostoSeletivo, aliquotasNominais, tributacaoRegular, gComponentesBC… seguem para a calculadora

export const operacaoSchema = z
  .object({
    id: z.string({ required_error: "id da operação é obrigatório (exigido pela calculadora)" }).min(1).max(100),
    versao: z.string().default("1.0.0"), // versão do layout OperacaoInput (obrigatória na calculadora)
    dhFatoGerador: z.string().datetime({ offset: true, message: "dhFatoGerador deve ser ISO 8601 com fuso (ex.: 2027-03-10T10:00:00-03:00)" }),
    municipio: z.number().int().min(1000000).max(9999999),
    uf: z.string().regex(/^[A-Z]{2}$/, "UF com 2 letras maiúsculas"),
    itens: z.array(itemSchema).min(1, "a operação precisa de ao menos 1 item"),
    chaveAcesso: z.string().regex(/^\d{44}$/, "chaveAcesso deve ter 44 dígitos").optional(),
    numero: z.union([z.string(), z.number()]).transform(String).optional(),
    serie: z.union([z.string(), z.number()]).transform(String).optional(),
    tipoDfe: z.string().max(10).optional(),
  })
  .passthrough()
  .superRefine((op, ctx) => {
    const vistos = new Set<number>();
    op.itens.forEach((it, i) => {
      if (vistos.has(it.numero)) ctx.addIssue({ code: "custom", path: ["itens", i, "numero"], message: `item ${it.numero} repetido` });
      vistos.add(it.numero);
      if (!it.ncm && !it.nbs) ctx.addIssue({ code: "custom", path: ["itens", i], message: "informe ncm (bens) ou nbs (serviços)" });
    });
  });

export type Operacao = z.infer<typeof operacaoSchema>;
export type ErroLayout = { campo: string; mensagem: string; codigo?: string };

export const LIMITE_OPERACOES_POR_ARQUIVO = 5000;

/** Valida o conteúdo do arquivo. Retorna as operações ou a lista de erros (campo em JSON Pointer). */
export function validarArquivo(conteudo: string): { ok: true; operacoes: Operacao[] } | { ok: false; erros: ErroLayout[] } {
  let json: unknown;
  try {
    json = JSON.parse(conteudo.replace(/^﻿/, ""));
  } catch (e) {
    return { ok: false, erros: [{ campo: "#", mensagem: `JSON inválido: ${(e as Error).message}` }] };
  }
  const lista = Array.isArray(json) ? json : [json];
  if (lista.length === 0) return { ok: false, erros: [{ campo: "#", mensagem: "arquivo sem operações" }] };
  if (lista.length > LIMITE_OPERACOES_POR_ARQUIVO) {
    return { ok: false, erros: [{ campo: "#", mensagem: `máximo de ${LIMITE_OPERACOES_POR_ARQUIVO} operações por arquivo` }] };
  }

  const r = z.array(operacaoSchema).safeParse(lista);
  if (r.success) return { ok: true, operacoes: r.data };

  const multiplas = Array.isArray(json);
  const erros = r.error.issues.slice(0, 200).map((iss) => {
    const caminho = multiplas ? iss.path : iss.path.slice(1);
    return { campo: "#/" + caminho.join("/"), mensagem: iss.message };
  });
  return { ok: false, erros };
}

/** Corpo enviado à calculadora: sem os campos exclusivos do ApuraRTC. */
export function paraCalculadora(op: Operacao): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { chaveAcesso, numero, serie, tipoDfe, ...resto } = op;
  return {
    ...resto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    itens: op.itens.map(({ informado, ...item }) => item),
  };
}
