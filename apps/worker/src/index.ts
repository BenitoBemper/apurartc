// Worker do ApuraRTC: consome a fila pgmq "importacoes" e processa cada arquivo.
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { FILA, carregarVersao, processarMensagem, versao, type Mensagem } from "./processar.js";

const env = (k: string, padrao?: string) => {
  const v = process.env[k] ?? padrao;
  if (!v) throw new Error(`variável de ambiente ${k} não definida (veja .env.example)`);
  return v;
};

const CALC_URL = env("CALCULADORA_URL", "http://localhost:8080/api");
const POLL_MS = Number(env("POLL_MS", "2000"));
const VT_SEGUNDOS = 600; // tempo de invisibilidade da mensagem durante o processamento
const LOTE = 3;

const pool = new pg.Pool({ connectionString: env("DATABASE_URL"), max: 5 });
const storage = createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

let parar = false;
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    console.log(`[worker] ${sinal}: encerrando após a mensagem atual…`);
    parar = true;
  });
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await carregarVersao(CALC_URL);
  console.log(`[worker] fila "${FILA}" · calculadora ${CALC_URL} (app ${versao.app}, base ${versao.db})`);

  while (!parar) {
    try {
      const { rows } = await pool.query<Mensagem>(
        "select msg_id::text, read_ct, message from pgmq.read($1, $2, $3)",
        [FILA, VT_SEGUNDOS, LOTE],
      );
      if (!rows.length) {
        await dormir(POLL_MS);
        continue;
      }
      if (versao.app === "desconhecida") await carregarVersao(CALC_URL);
      for (const m of rows) {
        await processarMensagem(m, { pool, storage, calculadoraUrl: CALC_URL });
      }
    } catch (e) {
      console.error("[worker] erro no ciclo:", (e as Error).message);
      await dormir(POLL_MS * 2);
    }
  }
  await pool.end();
}

void main();
