// Relatório mensal: débito (notas emitidas) − crédito (notas recebidas) = saldo, por tributo.
// Determinístico: soma em centavos inteiros. O IS não gera crédito.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@apurartc/db";

export type Valores = { cbs: number; ibsUf: number; ibsMun: number; is: number };
export type LinhaTotal = {
  competencia: string | null;
  papel: "emitida" | "recebida" | null;
  cbs_total: number | null;
  ibs_uf_total: number | null;
  ibs_mun_total: number | null;
  is_total: number | null;
  qtd_itens: number | null;
  qtd_calculados: number | null;
};
export type Resumo = {
  competencia: string; // AAAA-MM
  debito: Valores;
  credito: Valores;
  saldo: Valores; // positivo = a recolher; negativo = saldo credor
  qtdItens: number;
  qtdCalculados: number;
};

const ZERO: Valores = { cbs: 0, ibsUf: 0, ibsMun: 0, is: 0 };
const centavos = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);

function somar(linhas: LinhaTotal[]): Valores {
  const c = linhas.reduce(
    (s, l) => ({
      cbs: s.cbs + centavos(l.cbs_total),
      ibsUf: s.ibsUf + centavos(l.ibs_uf_total),
      ibsMun: s.ibsMun + centavos(l.ibs_mun_total),
      is: s.is + centavos(l.is_total),
    }),
    { ...ZERO },
  );
  return { cbs: c.cbs / 100, ibsUf: c.ibsUf / 100, ibsMun: c.ibsMun / 100, is: c.is / 100 };
}

/** Consolida as linhas de vw_totais_mensais de uma competência (AAAA-MM). */
export function resumir(linhas: LinhaTotal[], competencia: string): Resumo {
  const doMes = linhas.filter((l) => (l.competencia ?? "").startsWith(competencia));
  const debito = somar(doMes.filter((l) => l.papel === "emitida"));
  const creditoBruto = somar(doMes.filter((l) => l.papel === "recebida"));
  const credito = { ...creditoBruto, is: 0 }; // IS é monofásico: não gera crédito
  const saldo: Valores = {
    cbs: (centavos(debito.cbs) - centavos(credito.cbs)) / 100,
    ibsUf: (centavos(debito.ibsUf) - centavos(credito.ibsUf)) / 100,
    ibsMun: (centavos(debito.ibsMun) - centavos(credito.ibsMun)) / 100,
    is: debito.is,
  };
  return {
    competencia,
    debito,
    credito,
    saldo,
    qtdItens: doMes.reduce((s, l) => s + (l.qtd_itens ?? 0), 0),
    qtdCalculados: doMes.reduce((s, l) => s + (l.qtd_calculados ?? 0), 0),
  };
}

/** AAAA-MM dos n meses terminando em `competencia` (mais antigo primeiro). */
export function mesesAte(competencia: string, n: number): string[] {
  const [a, m] = competencia.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export type DadosRelatorio = {
  empresa: { id: string; cnpj: string; razao_social: string };
  resumo: Resumo;
  historico: Resumo[];
  notas: { emitidas: number; recebidas: number };
  divergencias: number;
  versaoCalculadora: string | null;
};

/** Busca os dados do relatório. Funciona com o cliente do usuário (RLS) ou com o admin (filtrado pela empresa). */
export async function obterRelatorio(
  sb: SupabaseClient<Database>,
  empresa: DadosRelatorio["empresa"],
  competencia: string,
): Promise<DadosRelatorio> {
  const meses = mesesAte(competencia, 6);
  const comp = `${competencia}-01`;
  const [totais, emitidas, recebidas, diverg, versao] = await Promise.all([
    sb.from("vw_totais_mensais").select("competencia, papel, cbs_total, ibs_uf_total, ibs_mun_total, is_total, qtd_itens, qtd_calculados")
      .eq("empresa_id", empresa.id).gte("competencia", `${meses[0]}-01`).lte("competencia", comp),
    sb.from("documentos").select("id", { count: "exact", head: true }).eq("empresa_id", empresa.id).eq("competencia", comp).eq("papel", "emitida"),
    sb.from("documentos").select("id", { count: "exact", head: true }).eq("empresa_id", empresa.id).eq("competencia", comp).eq("papel", "recebida"),
    sb.from("vw_divergencias").select("item_id", { count: "exact", head: true }).eq("empresa_id", empresa.id).eq("competencia", comp).gte("diferenca_abs", 0.01),
    sb.from("resultados_calculo").select("versao_calculadora, versao_base").eq("empresa_id", empresa.id).eq("competencia", comp)
      .order("criado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (totais.error) throw new Error(totais.error.message);
  const linhas = (totais.data ?? []) as LinhaTotal[];
  return {
    empresa,
    resumo: resumir(linhas, competencia),
    historico: meses.map((m) => resumir(linhas, m)),
    notas: { emitidas: emitidas.count ?? 0, recebidas: recebidas.count ?? 0 },
    divergencias: diverg.count ?? 0,
    versaoCalculadora: versao.data ? `${versao.data.versao_calculadora} (base ${versao.data.versao_base})` : null,
  };
}
