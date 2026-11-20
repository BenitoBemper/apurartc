// Processa uma mensagem da fila "importacoes": valida → calcula → grava (uma transação) → atualiza uso.
import type { Pool, PoolClient } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarArquivo, paraCalculadora, type Operacao } from "./layout.js";
import { calcular, lerObjeto, ErroCalculadora, type RespostaRoc } from "./calculadora.js";

export const FILA = "importacoes";
export const BUCKET = "arquivos";
export const LIMITE_NOTAS_MES = 5000; // MVP: todas as empresas do escritório somadas
export const MAX_TENTATIVAS = 3;
const CONCORRENCIA = 4;

export type Mensagem = { msg_id: string; read_ct: number; message: { importacao_id?: string } };
export type Deps = { pool: Pool; storage: SupabaseClient; calculadoraUrl: string; log?: (m: string) => void };

type Importacao = {
  id: string;
  escritorio_id: string;
  empresa_id: string;
  arquivo_path: string;
  formato: string;
  status: string;
};

class FalhaDefinitiva extends Error {}

/** "2027-03-10T10:00:00-03:00" → "2027-03-01" (mês no fuso de Brasília, como a coluna gerada do banco). */
export function competenciaDe(dh: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .formatToParts(new Date(dh));
  const ano = p.find((x) => x.type === "year")!.value;
  const mes = p.find((x) => x.type === "month")!.value;
  return `${ano}-${mes}-01`;
}

async function emLotes<T, R>(lista: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const saida = new Array<R>(lista.length);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, lista.length) }, async () => {
      while (proximo < lista.length) {
        const i = proximo++;
        saida[i] = await fn(lista[i], i);
      }
    }),
  );
  return saida;
}

export async function processarMensagem(m: Mensagem, deps: Deps): Promise<"concluido" | "erro" | "retentar" | "ignorado"> {
  const { pool, log = console.log } = deps;
  const id = m.message?.importacao_id;
  const arquivar = () => pool.query("select pgmq.archive($1, $2::bigint)", [FILA, m.msg_id]);

  const { rows } = id
    ? await pool.query<Importacao>(
        "select id, escritorio_id, empresa_id, arquivo_path, formato, status from public.importacoes where id = $1",
        [id],
      )
    : { rows: [] as Importacao[] };
  const imp = rows[0];
  if (!imp || imp.status === "concluido" || imp.status === "erro") {
    await arquivar();
    return "ignorado";
  }

  const status = (s: string) => pool.query("update public.importacoes set status = $2 where id = $1", [imp.id, s]);

  try {
    await status("validando");
    if (imp.formato !== "json") throw new FalhaDefinitiva(`formato ${imp.formato} ainda não é suportado (MVP: JSON)`);

    const { data: blob, error } = await deps.storage.storage.from(BUCKET).download(imp.arquivo_path);
    if (error || !blob) throw new Error(`não foi possível baixar o arquivo: ${error?.message ?? "vazio"}`);

    const v = validarArquivo(await blob.text());
    if (!v.ok) {
      await registrarErroLayout(pool, imp, v.erros);
      await arquivar();
      log(`[${imp.id}] layout inválido (${v.erros.length} erros)`);
      return "erro";
    }

    await verificarLimite(pool, imp.escritorio_id, v.operacoes);
    await status("processando");

    const rocs = await emLotes(v.operacoes, CONCORRENCIA, async (op, o) => {
      try {
        return await calcular(deps.calculadoraUrl, paraCalculadora(op));
      } catch (e) {
        // Aponta a operação do arquivo (lista) nos erros devolvidos pela calculadora
        if (e instanceof ErroCalculadora && v.operacoes.length > 1) {
          e.erros = e.erros.map((x) => ({ ...x, campo: `#/${o}${x.campo.replace(/^#/, "")}` }));
        }
        throw e;
      }
    });

    const rocPath = `${imp.escritorio_id}/${imp.empresa_id}/roc/${imp.id}.json`;
    const up = await deps.storage.storage
      .from(BUCKET)
      .upload(rocPath, JSON.stringify(rocs), { contentType: "application/json", upsert: true });
    if (up.error) throw new Error(`falha ao gravar o ROC: ${up.error.message}`);

    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      const r = await gravar(cliente, imp, v.operacoes, rocs, rocPath);
      await cliente.query("commit");
      log(`[${imp.id}] concluída: ${r.docs} documentos, ${r.itens} itens, ${r.erros} com erro`);
    } catch (e) {
      await cliente.query("rollback");
      throw e;
    } finally {
      cliente.release();
    }
    await arquivar();
    return "concluido";
  } catch (e) {
    if (e instanceof ErroCalculadora && !e.transitorio && e.erros.length) {
      await registrarErroLayout(pool, imp, e.erros, e.message);
      await arquivar();
      log(`[${imp.id}] rejeitada pela calculadora (${e.erros.length} erros)`);
      return "erro";
    }
    const transitorio = !(e instanceof FalhaDefinitiva) && !(e instanceof ErroCalculadora && !e.transitorio);
    if (transitorio && m.read_ct < MAX_TENTATIVAS) {
      // A mensagem volta a ficar visível quando o vt expirar.
      await status("recebido");
      log(`[${imp.id}] falha temporária (tentativa ${m.read_ct}/${MAX_TENTATIVAS}): ${(e as Error).message}`);
      return "retentar";
    }
    await pool.query(
      "update public.importacoes set status = 'erro', mensagem_erro = $2, concluido_em = now() where id = $1",
      [imp.id, (e as Error).message.slice(0, 1000)],
    );
    await arquivar();
    log(`[${imp.id}] erro: ${(e as Error).message}`);
    return "erro";
  }
}

async function registrarErroLayout(
  pool: Pool,
  imp: Importacao,
  erros: { campo: string; mensagem: string; codigo?: string }[],
  mensagem = "Layout inválido: veja os erros de validação",
) {
  await pool.query(
    `insert into public.erros_validacao (escritorio_id, empresa_id, importacao_id, codigo, campo, mensagem)
     select $1, $2, $3, coalesce(x.codigo, 'LAYOUT'), x.campo, x.mensagem
     from jsonb_to_recordset($4::jsonb) as x(codigo text, campo text, mensagem text)`,
    [imp.escritorio_id, imp.empresa_id, imp.id, JSON.stringify(erros)],
  );
  await pool.query(
    `update public.importacoes set status = 'erro', qtd_erros = $2, concluido_em = now(), mensagem_erro = $3 where id = $1`,
    [imp.id, erros.length, mensagem.slice(0, 1000)],
  );
}

async function verificarLimite(pool: Pool, escritorioId: string, ops: Operacao[]) {
  const porMes = new Map<string, number>();
  for (const op of ops) {
    const c = competenciaDe(op.dhFatoGerador);
    porMes.set(c, (porMes.get(c) ?? 0) + 1);
  }
  for (const [comp, novas] of porMes) {
    const { rows } = await pool.query<{ qtd_notas: number }>(
      "select qtd_notas from public.uso_mensal where escritorio_id = $1 and competencia = $2",
      [escritorioId, comp],
    );
    const atual = rows[0]?.qtd_notas ?? 0;
    if (atual + novas > LIMITE_NOTAS_MES) {
      throw new FalhaDefinitiva(
        `limite do plano gratuito: ${LIMITE_NOTAS_MES} notas/mês (competência ${comp.slice(0, 7)} já tem ${atual}, o arquivo traz ${novas})`,
      );
    }
  }
}

async function gravar(c: PoolClient, imp: Importacao, ops: Operacao[], rocs: RespostaRoc[], rocPath: string) {
  let itensTotal = 0;
  let itensErro = 0;
  const competencias = new Map<string, number>();

  for (let o = 0; o < ops.length; o++) {
    const op = ops[o];
    const doc = await c.query<{ id: string; competencia: string }>(
      `insert into public.documentos (escritorio_id, empresa_id, importacao_id, tipo_dfe, chave_acesso, numero, serie,
         dh_emissao, dh_fato_gerador, uf, municipio)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10)
       returning id, to_char(competencia, 'YYYY-MM-DD') as competencia`,
      [imp.escritorio_id, imp.empresa_id, imp.id, op.tipoDfe ?? "OPERACAO", op.chaveAcesso ?? null,
       op.numero ?? op.id ?? null, op.serie ?? null, op.dhFatoGerador, op.uf, op.municipio],
    );
    const { id: docId, competencia } = doc.rows[0];
    competencias.set(competencia, (competencias.get(competencia) ?? 0) + 1);

    const itens = op.itens.map((it) => ({
      numero: it.numero, ncm: it.ncm ?? null, nbs: it.nbs ?? null, cst: it.cst, cclasstrib: it.cClassTrib,
      base_calculo: it.baseCalculo ?? null, quantidade: it.quantidade ?? null, unidade: it.unidade ?? null,
      cbs_informado: it.informado?.cbs ?? null, ibs_uf_informado: it.informado?.ibsUf ?? null,
      ibs_mun_informado: it.informado?.ibsMun ?? null, is_informado: it.informado?.is ?? null,
    }));
    const ins = await c.query<{ id: string; numero: number }>(
      `insert into public.itens (competencia, escritorio_id, empresa_id, documento_id, numero, ncm, nbs, cst, cclasstrib,
         base_calculo, quantidade, unidade, cbs_informado, ibs_uf_informado, ibs_mun_informado, is_informado)
       select $1::date, $2, $3, $4, x.numero, x.ncm, x.nbs, x.cst, x.cclasstrib, x.base_calculo, x.quantidade, x.unidade,
              x.cbs_informado, x.ibs_uf_informado, x.ibs_mun_informado, x.is_informado
       from jsonb_to_recordset($5::jsonb) as x(numero int, ncm text, nbs text, cst text, cclasstrib text,
         base_calculo numeric, quantidade numeric, unidade text, cbs_informado numeric, ibs_uf_informado numeric,
         ibs_mun_informado numeric, is_informado numeric)
       returning id, numero`,
      [competencia, imp.escritorio_id, imp.empresa_id, docId, JSON.stringify(itens)],
    );
    const idPorNumero = new Map(ins.rows.map((r) => [r.numero, r.id]));

    // objetos[i] corresponde a itens[i] (mesma ordem do envio)
    const resultados: Record<string, unknown>[] = [];
    const erros: Record<string, unknown>[] = [];
    rocs[o].objetos.forEach((obj, i) => {
      const item = op.itens[i];
      if (!item) return;
      const r = lerObjeto(obj);
      itensTotal++;
      if (r.estado !== "CALCULADO" && r.estado !== "CALCULO_SIMULADO") itensErro++;
      resultados.push({
        item_id: idPorNumero.get(item.numero), estado_item: r.estado,
        cbs_aliquota: r.cbs_aliquota, cbs_valor: r.cbs_valor, ibs_uf_aliquota: r.ibs_uf_aliquota, ibs_uf_valor: r.ibs_uf_valor,
        ibs_mun_aliquota: r.ibs_mun_aliquota, ibs_mun_valor: r.ibs_mun_valor, is_aliquota: r.is_aliquota, is_valor: r.is_valor,
        roc_path: `${rocPath}#/${o}/objetos/${i}`,
      });
      for (const e of r.erros) erros.push({ item_numero: item.numero, ...e });
    });

    await c.query(
      `insert into public.resultados_calculo (competencia, escritorio_id, empresa_id, item_id, versao_calculadora, versao_base,
         estado_item, cbs_aliquota, cbs_valor, ibs_uf_aliquota, ibs_uf_valor, ibs_mun_aliquota, ibs_mun_valor,
         is_aliquota, is_valor, roc_path)
       select $1::date, $2, $3, x.item_id, $4, $5, x.estado_item::public.estado_item, x.cbs_aliquota, x.cbs_valor,
              x.ibs_uf_aliquota, x.ibs_uf_valor, x.ibs_mun_aliquota, x.ibs_mun_valor, x.is_aliquota, x.is_valor, x.roc_path
       from jsonb_to_recordset($6::jsonb) as x(item_id uuid, estado_item text, cbs_aliquota numeric, cbs_valor numeric,
         ibs_uf_aliquota numeric, ibs_uf_valor numeric, ibs_mun_aliquota numeric, ibs_mun_valor numeric,
         is_aliquota numeric, is_valor numeric, roc_path text)`,
      [competencia, imp.escritorio_id, imp.empresa_id, versao.app, versao.db, JSON.stringify(resultados)],
    );

    if (erros.length) {
      await c.query(
        `insert into public.erros_validacao (escritorio_id, empresa_id, importacao_id, documento_id, item_numero, codigo, campo, mensagem)
         select $1, $2, $3, $4, x.item_numero, x.codigo, x.campo, x.mensagem
         from jsonb_to_recordset($5::jsonb) as x(item_numero int, codigo text, campo text, mensagem text)`,
        [imp.escritorio_id, imp.empresa_id, imp.id, docId, JSON.stringify(erros)],
      );
    }
  }

  await c.query(
    `update public.importacoes set status = 'concluido', qtd_docs = $2, qtd_erros = $3, concluido_em = now(),
       mensagem_erro = null where id = $1`,
    [imp.id, ops.length, itensErro],
  );

  for (const [comp, qtd] of competencias) {
    await c.query(
      `insert into public.uso_mensal as u (escritorio_id, competencia, qtd_notas, qtd_cnpjs)
       values ($1, $2::date, $3,
         (select count(distinct d.empresa_id) from public.documentos d where d.escritorio_id = $1 and d.competencia = $2::date))
       on conflict (escritorio_id, competencia) do update
         set qtd_notas = u.qtd_notas + excluded.qtd_notas, qtd_cnpjs = excluded.qtd_cnpjs, atualizado_em = now()`,
      [imp.escritorio_id, comp, qtd],
    );
  }
  return { docs: ops.length, itens: itensTotal, erros: itensErro };
}

/** Versão da calculadora/base (gravada em cada resultado). Atualizada no início do worker. */
export const versao = { app: "desconhecida", db: "desconhecida" };

export async function carregarVersao(calculadoraUrl: string) {
  try {
    const r = await fetch(`${calculadoraUrl}/calculadora/dados-abertos/versao`, { signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { versaoApp?: string; versaoDb?: string };
    versao.app = j.versaoApp ?? versao.app;
    versao.db = j.versaoDb ?? versao.db;
  } catch {
    /* mantém "desconhecida"; o processamento falhará e será retentado se a calculadora estiver fora */
  }
}
