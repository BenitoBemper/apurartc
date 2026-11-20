// Cliente da calculadora oficial (POST /calculadora/observabilidade/regime-geral) e leitura do ROC.

export const ESTADOS = ["CALCULADO", "CALCULO_SIMULADO", "INCONSISTENCIA_ENTRADA", "NAO_IMPLEMENTADO", "FALHA_TECNICA"] as const;
export type EstadoItem = (typeof ESTADOS)[number];

type Grupo = Record<string, unknown> & { gRed?: { pAliqEfet?: string } };

export type ObjetoRoc = {
  nObj: number;
  estadoItem: string;
  tribCalc?: {
    IS?: { pIS?: string; vIS?: string };
    IBSCBS?: { gIBSCBS?: { gIBSUF?: Grupo; gIBSMun?: Grupo; gCBS?: Grupo } };
  };
  erros?: { code: string; title?: string; pointer?: string; detail?: string }[];
};
export type RespostaRoc = { objetos: ObjetoRoc[]; total?: unknown };

export type ResultadoItem = {
  estado: EstadoItem;
  cbs_aliquota: number | null;
  cbs_valor: number | null;
  ibs_uf_aliquota: number | null;
  ibs_uf_valor: number | null;
  ibs_mun_aliquota: number | null;
  ibs_mun_valor: number | null;
  is_aliquota: number | null;
  is_valor: number | null;
  erros: { codigo: string; campo: string | null; mensagem: string }[];
};

export type ErroRejeicao = { codigo: string; campo: string; mensagem: string };

export class ErroCalculadora extends Error {
  /** Erros da rejeição 4xx (problem+json da calculadora), com o índice da operação no arquivo. */
  erros: ErroRejeicao[] = [];
  constructor(message: string, readonly transitorio: boolean) {
    super(message);
  }
}

type ProblemJson = { title?: string; detail?: string; errors?: { code?: string; title?: string; pointer?: string; detail?: string }[] };

export async function calcular(baseUrl: string, operacao: Record<string, unknown>, timeoutMs = 60_000): Promise<RespostaRoc> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/calculadora/observabilidade/regime-geral`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(operacao),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ErroCalculadora(`calculadora indisponível: ${(e as Error).message}`, true);
  }
  const texto = await res.text();
  if (!res.ok) {
    // 5xx = falha da calculadora (tentar de novo); 4xx = entrada rejeitada inteira
    const erro = new ErroCalculadora(`calculadora HTTP ${res.status}: ${texto.slice(0, 500)}`, res.status >= 500);
    if (res.status < 500) {
      try {
        const p = JSON.parse(texto) as ProblemJson;
        erro.message = `A calculadora rejeitou a operação: ${p.detail ?? p.title ?? res.status}`;
        erro.erros = (p.errors ?? []).map((e) => ({
          codigo: e.code ?? `HTTP-${res.status}`,
          campo: e.pointer ?? "#",
          mensagem: [e.title, e.detail].filter(Boolean).join(": ") || "rejeitado",
        }));
      } catch {
        /* corpo não é JSON: mantém a mensagem crua */
      }
    }
    throw erro;
  }
  const json = JSON.parse(texto) as RespostaRoc;
  if (!Array.isArray(json.objetos)) throw new ErroCalculadora("resposta da calculadora sem 'objetos'", false);
  return json;
}

const num = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Number(v));
const aliquota = (g: Grupo | undefined, campo: string): number | null =>
  g ? num(g.gRed?.pAliqEfet ?? g[campo]) : null; // alíquota efetiva quando há redução

/** Converte um objeto do ROC nos valores gravados em resultados_calculo. */
export function lerObjeto(obj: ObjetoRoc): ResultadoItem {
  const estado = (ESTADOS as readonly string[]).includes(obj.estadoItem) ? (obj.estadoItem as EstadoItem) : "FALHA_TECNICA";
  const g = obj.tribCalc?.IBSCBS?.gIBSCBS;
  const is = obj.tribCalc?.IS;
  return {
    estado,
    cbs_aliquota: aliquota(g?.gCBS, "pCBS"),
    cbs_valor: num(g?.gCBS?.vCBS),
    ibs_uf_aliquota: aliquota(g?.gIBSUF, "pIBSUF"),
    ibs_uf_valor: num(g?.gIBSUF?.vIBSUF),
    ibs_mun_aliquota: aliquota(g?.gIBSMun, "pIBSMun"),
    ibs_mun_valor: num(g?.gIBSMun?.vIBSMun),
    is_aliquota: num(is?.pIS),
    is_valor: num(is?.vIS),
    erros: (obj.erros ?? []).map((e) => ({
      codigo: e.code,
      campo: e.pointer ?? null,
      mensagem: [e.title, e.detail].filter(Boolean).join(": ") || e.code,
    })),
  };
}
