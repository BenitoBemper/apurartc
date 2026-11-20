// Tipos do banco (gerados por `npm run db:types`) e atalhos usados pelo web e pelo worker.
export type { Database, Json } from "./database.types.js";
import type { Database } from "./database.types.js";

type Public = Database["public"];

export type Tabela<T extends keyof Public["Tables"]> = Public["Tables"][T]["Row"];
export type NovaLinha<T extends keyof Public["Tables"]> = Public["Tables"][T]["Insert"];
export type View<T extends keyof Public["Views"]> = Public["Views"][T]["Row"];
export type Enum<T extends keyof Public["Enums"]> = Public["Enums"][T];

export const FILA_IMPORTACOES = "importacoes";
export const BUCKET_ARQUIVOS = "arquivos";

/** Caminho no Storage: {escritorio_id}/{empresa_id}/{pasta}/{arquivo} */
export function caminhoArquivo(
  escritorioId: string,
  empresaId: string,
  pasta: "importacoes" | "roc",
  arquivo: string,
): string {
  return `${escritorioId}/${empresaId}/${pasta}/${arquivo}`;
}
