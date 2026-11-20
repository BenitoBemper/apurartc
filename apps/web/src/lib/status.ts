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

/** "{esc}/{emp}/importacoes/{uuid}__nota.json" → "nota.json" */
export function nomeOriginal(path: string) {
  const base = path.split("/").pop() ?? path;
  return base.replace(/^[0-9a-f-]{36}__/, "");
}
