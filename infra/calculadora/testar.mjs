// Teste de fumaça da calculadora: node infra/calculadora/testar.mjs [URL_BASE]
// Envia exemplos/operacao.json para /observabilidade/regime-geral e confere o resultado esperado de docs/exemplos.md.
import { readFile } from "node:fs/promises";

const base = process.argv[2] ?? "http://localhost:8080/api";
const body = await readFile(new URL("./exemplos/operacao.json", import.meta.url), "utf8");

const res = await fetch(`${base}/calculadora/observabilidade/regime-geral`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body,
});
const json = await res.json();

console.log(`HTTP ${res.status}`);
for (const o of json.objetos ?? []) {
  const erro = o.erros?.[0] ? ` → ${o.erros[0].code}: ${o.erros[0].title}` : "";
  console.log(`item ${o.nObj}: ${o.estadoItem}${erro}`);
}
const t = json.total?.tribCalc ?? {};
const got = {
  vIS: t.ISTot?.vIS,
  vBCIBSCBS: t.IBSCBSTot?.vBCIBSCBS,
  vIBS: t.IBSCBSTot?.gIBS?.vIBS,
  vCBS: t.IBSCBSTot?.gCBS?.vCBS,
};
console.log("totais:", got);

const esperado = { vIS: "15.00", vBCIBSCBS: "1465.00", vIBS: "0.64", vCBS: "56.76" };
const ok = Object.entries(esperado).every(([k, v]) => String(got[k]) === v);
console.log(ok ? "OK: totais conferem com docs/exemplos.md" : `DIVERGENTE: esperado ${JSON.stringify(esperado)}`);
// exitCode em vez de process.exit(): no Windows, sair com o fetch ainda aberto dispara uma assertion do libuv.
process.exitCode = ok ? 0 : 1;
