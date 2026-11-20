// Chaves da API pública: "artc_" + 32 bytes aleatórios (base64url). O banco guarda só o SHA-256.
import { createHash, randomBytes } from "node:crypto";

export const ESCOPOS = ["importar", "consultar"] as const;
export type Escopo = (typeof ESCOPOS)[number];

const FORMATO = /^artc_[A-Za-z0-9_-]{43}$/;

export function gerarChave(): { chave: string; prefixo: string; hash: string } {
  const chave = `artc_${randomBytes(32).toString("base64url")}`;
  return { chave, prefixo: chave.slice(0, 12), hash: hashChave(chave) };
}

export function hashChave(chave: string): string {
  return createHash("sha256").update(chave, "utf8").digest("hex");
}

export function formatoValido(chave: string): boolean {
  return FORMATO.test(chave);
}

/** Lê a chave de "Authorization: Bearer artc_…" ou "X-API-Key: artc_…". */
export function chaveDoCabecalho(h: Headers): string | null {
  const auth = h.get("authorization");
  const valor = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : h.get("x-api-key")?.trim();
  return valor && formatoValido(valor) ? valor : null;
}
