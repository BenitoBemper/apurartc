import { describe, expect, it } from "vitest";
import { chaveDoCabecalho, formatoValido, gerarChave, hashChave } from "./api-chave";

describe("chaves de API", () => {
  it("gera chave única, com prefixo e hash SHA-256", () => {
    const a = gerarChave();
    const b = gerarChave();
    expect(a.chave).not.toBe(b.chave);
    expect(formatoValido(a.chave)).toBe(true);
    expect(a.prefixo).toBe(a.chave.slice(0, 12));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashChave(a.chave));
    expect(a.hash).not.toContain(a.chave.slice(5));
  });

  it("lê do Authorization: Bearer ou X-API-Key e rejeita formato inválido", () => {
    const { chave } = gerarChave();
    expect(chaveDoCabecalho(new Headers({ Authorization: `Bearer ${chave}` }))).toBe(chave);
    expect(chaveDoCabecalho(new Headers({ "X-API-Key": chave }))).toBe(chave);
    expect(chaveDoCabecalho(new Headers({ Authorization: "Bearer eyJhbGciOi.jwt.qualquer" }))).toBeNull();
    expect(chaveDoCabecalho(new Headers())).toBeNull();
  });
});
