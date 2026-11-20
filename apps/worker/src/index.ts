// Worker do ApuraRTC: processa a fila de importação, chama a calculadora e (v1.1) a API de apuração CBS.
// Por enquanto só verifica se a calculadora está acessível.

const CALC_URL = process.env.CALCULADORA_URL ?? "http://localhost:8080/api";

async function main(): Promise<void> {
  try {
    const res = await fetch(`${CALC_URL}/calculadora/dados-abertos/versao`);
    console.log(`[worker] calculadora em ${CALC_URL}: HTTP ${res.status}`);
  } catch (err) {
    console.error(`[worker] calculadora indisponível em ${CALC_URL}:`, (err as Error).message);
  }
}

void main();
