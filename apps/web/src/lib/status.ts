export const STATUS_IMPORTACAO: Record<string, { rotulo: string; variante: "default" | "secondary" | "destructive" | "outline" }> = {
  recebido: { rotulo: "Na fila", variante: "outline" },
  validando: { rotulo: "Validando", variante: "secondary" },
  processando: { rotulo: "Calculando", variante: "secondary" },
  concluido: { rotulo: "Concluído", variante: "default" },
  erro: { rotulo: "Erro", variante: "destructive" },
};

export function statusImportacao(s: string) {
  return STATUS_IMPORTACAO[s] ?? { rotulo: s, variante: "outline" as const };
}

export const TRIBUTOS = [
  { id: "CBS", rotulo: "CBS" },
  { id: "IBS_UF", rotulo: "IBS estadual" },
  { id: "IBS_MUN", rotulo: "IBS municipal" },
  { id: "IS", rotulo: "Imposto Seletivo" },
] as const;

export const ESTADO_ITEM: Record<string, { rotulo: string; erro: boolean }> = {
  CALCULADO: { rotulo: "Calculado", erro: false },
  CALCULO_SIMULADO: { rotulo: "Simulado", erro: false },
  INCONSISTENCIA_ENTRADA: { rotulo: "Inconsistência", erro: true },
  NAO_IMPLEMENTADO: { rotulo: "Não implementado", erro: true },
  FALHA_TECNICA: { rotulo: "Falha técnica", erro: true },
};

export const PAPEL = { emitida: "Emitida (débito)", recebida: "Recebida (crédito)" } as const;

/** "{esc}/{emp}/importacoes/{uuid}__nota.json" → "nota.json" */
export function nomeOriginal(path: string) {
  const base = path.split("/").pop() ?? path;
  return base.replace(/^[0-9a-f-]{36}__/, "");
}
