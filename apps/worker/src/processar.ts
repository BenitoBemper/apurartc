// Processa uma mensagem da fila "importacoes": lê → valida → calcula → grava (uma transação) → atualiza uso.
// JSON: o arquivo é uma unidade (layout inválido = importação com erro).
// XML/ZIP: cada nota é independente (notas com erro são registradas e as demais seguem).
import type { Pool, PoolClient } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarArquivo, paraCalculadora, type Operacao } from "./layout.js";
import { calcular, lerObjeto, validarXmlOficial, ErroCalculadora, type RespostaRoc } from "./calculadora.js";
import { lerXml, lerZip, type PapelNota, type ResultadoLeitura } from "./xml.js";

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
  empresa_cnpj: string;
  arquivo_path: string;
  formato: string;
  status: string;
};

/** Uma nota a calcular. */
type Entrada = { operacao: Operacao; papel: PapelNota; arquivo: string | null };
/** Erro/aviso sem documento gravado (layout, XSD, nota de outra empresa, rejeição da calculadora…). */
type Ocorrencia = { codigo: string; campo: string; mensagem: string; arquivo: string | null };

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
        `select i.id, i.escritorio_id, i.empresa_id, e.cnpj as empresa_cnpj, i.arquivo_path, i.formato::text, i.status::text
         from public.importacoes i join public.empresas e on e.id = i.empresa_id where i.id = $1`,
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
    const { data: blob, error } = await deps.storage.storage.from(BUCKET).download(imp.arquivo_path);
    if (error || !blob) throw new Error(`não foi possível baixar o arquivo: ${error?.message ?? "vazio"}`);

    const ocorrencias: Ocorrencia[] = [];
    let entradas: Entrada[];

    if (imp.formato === "json") {
      const v = validarArquivo(await blob.text());
      if (!v.ok) {
        await finalizarComErro(pool, imp, v.erros.map((e) => ({ codigo: "LAYOUT", ...e, arquivo: null })),
          "Layout inválido: veja os erros de validação");
        await arquivar();
        log(`[${imp.id}] layout inválido (${v.erros.length} erros)`);
        return "erro";
      }
      entradas = v.operacoes.map((operacao) => ({ operacao, papel: "emitida" as const, arquivo: null }));
    } else if (imp.formato === "xml_nfe" || imp.formato === "zip") {
      const nome = imp.arquivo_path.split("/").pop()!.replace(/^[0-9a-f-]{36}__/, "");
      const leitura: ResultadoLeitura = imp.formato === "zip"
        ? lerZip(new Uint8Array(await blob.arrayBuffer()), imp.empresa_cnpj)
        : lerXml(nome, await blob.text(), imp.empresa_cnpj);
      ocorrencias.push(
        ...leitura.erros.map((e) => ({ codigo: "XML", campo: e.campo, mensagem: e.mensagem, arquivo: e.arquivo })),
        ...leitura.avisos.map((a) => ({ codigo: "AVISO", campo: "#", mensagem: a.mensagem, arquivo: a.arquivo })),
      );
      // Validador XSD oficial da calculadora, nota a nota
      const validas = await emLotes(leitura.notas, CONCORRENCIA, async (n) => {
        const r = await validarXmlOficial(deps.calculadoraUrl, n.modelo === "55" ? "nfe" : "nfce", n.xmlNFe);
        if (!r.ok) ocorrencias.push({ codigo: "XSD", campo: "#", mensagem: `nota ${n.chave}: ${r.mensagem}`, arquivo: n.arquivo });
        return r.ok;
      });
      entradas = leitura.notas
        .filter((_, i) => validas[i])
        .map((n) => ({ operacao: n.operacao, papel: n.papel, arquivo: n.arquivo }));
    } else {
      throw new FalhaDefinitiva(`formato ${imp.formato} não suportado`);
    }

    // Notas já importadas antes (mesma chave, empresa e papel) não entram de novo
    entradas = await removerDuplicadas(pool, imp, entradas, ocorrencias);

    if (entradas.length === 0) {
      const so = ocorrencias.length && ocorrencias.every((o) => o.codigo === "AVISO");
      await finalizarComErro(pool, imp, ocorrencias, so ? "Nenhuma nota nova para calcular" : "Nenhuma nota válida: veja os erros");
      await arquivar();
      log(`[${imp.id}] sem notas válidas`);
      return "erro";
    }

    await verificarLimite(pool, imp.escritorio_id, entradas);
    await status("processando");

    // JSON: rejeição da calculadora derruba o arquivo; XML/ZIP: só a nota
    const parcial = imp.formato !== "json";
    const rocs = await emLotes(entradas, CONCORRENCIA, async (e, o): Promise<RespostaRoc | null> => {
      try {
        return await calcular(deps.calculadoraUrl, paraCalculadora(e.operacao));
      } catch (err) {
        if (err instanceof ErroCalculadora && !err.transitorio && parcial) {
          const chave = e.operacao.chaveAcesso ?? e.operacao.id;
          const lista = err.erros.length ? err.erros : [{ codigo: "CALC", campo: "#", mensagem: err.message }];
          ocorrencias.push(...lista.map((x) => ({ ...x, mensagem: `nota ${chave}: ${x.mensagem}`, arquivo: e.arquivo })));
          return null;
        }
        if (err instanceof ErroCalculadora && entradas.length > 1) {
          err.erros = err.erros.map((x) => ({ ...x, campo: `#/${o}${x.campo.replace(/^#/, "")}` }));
        }
        throw err;
      }
    });

    const calculadas = entradas.map((e, i) => ({ ...e, roc: rocs[i] })).filter((e): e is Entrada & { roc: RespostaRoc } => !!e.roc);
    if (calculadas.length === 0) {
      await finalizarComErro(pool, imp, ocorrencias, "A calculadora rejeitou todas as notas: veja os erros");
      await arquivar();
      return "erro";
    }

    const rocPath = `${imp.escritorio_id}/${imp.empresa_id}/roc/${imp.id}.json`;
    const up = await deps.storage.storage
      .from(BUCKET)
      .upload(rocPath, JSON.stringify(calculadas.map((c) => c.roc)), { contentType: "application/json", upsert: true });
    if (up.error) throw new Error(`falha ao gravar o ROC: ${up.error.message}`);

    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      const r = await gravar(cliente, imp, calculadas, ocorrencias, rocPath);
      await cliente.query("commit");
      log(`[${imp.id}] concluída: ${r.docs} notas, ${r.itens} itens, ${r.erros} itens com erro, ${ocorrencias.length} ocorrências`);
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
      await finalizarComErro(pool, imp, e.erros.map((x) => ({ ...x, arquivo: null })), e.message);
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

async function inserirOcorrencias(c: Pool | PoolClient, imp: Importacao, lista: Ocorrencia[]) {
  if (!lista.length) return;
  await c.query(
    `insert into public.erros_validacao (escritorio_id, empresa_id, importacao_id, codigo, campo, mensagem, arquivo_origem)
     select $1, $2, $3, x.codigo, x.campo, x.mensagem, x.arquivo
     from jsonb_to_recordset($4::jsonb) as x(codigo text, campo text, mensagem text, arquivo text)`,
    [imp.escritorio_id, imp.empresa_id, imp.id, JSON.stringify(lista)],
  );
}

const contaComoErro = (lista: Ocorrencia[]) => lista.filter((o) => o.codigo !== "AVISO").length;

async function finalizarComErro(pool: Pool, imp: Importacao, lista: Ocorrencia[], mensagem: string) {
  await inserirOcorrencias(pool, imp, lista);
  await pool.query(
    `update public.importacoes set status = 'erro', qtd_erros = $2, concluido_em = now(), mensagem_erro = $3 where id = $1`,
    [imp.id, contaComoErro(lista), mensagem.slice(0, 1000)],
  );
}

async function removerDuplicadas(pool: Pool, imp: Importacao, entradas: Entrada[], ocorrencias: Ocorrencia[]) {
  const vistas = new Set<string>();
  const comChave = entradas.filter((e) => e.operacao.chaveAcesso).map((e) => e.operacao.chaveAcesso!);
  const { rows } = comChave.length
    ? await pool.query<{ chave_acesso: string; papel: string }>(
        "select chave_acesso, papel::text from public.documentos where empresa_id = $1 and chave_acesso = any($2::text[])",
        [imp.empresa_id, comChave],
      )
    : { rows: [] };
  const existentes = new Set(rows.map((r) => `${r.chave_acesso}|${r.papel}`));
  return entradas.filter((e) => {
    const ch = e.operacao.chaveAcesso;
    if (!ch) return true;
    const k = `${ch}|${e.papel}`;
    if (existentes.has(k) || vistas.has(k)) {
      ocorrencias.push({ codigo: "AVISO", campo: "#/chaveAcesso", mensagem: `nota ${ch} já importada: ignorada`, arquivo: e.arquivo });
      return false;
    }
    vistas.add(k);
    return true;
  });
}

async function verificarLimite(pool: Pool, escritorioId: string, entradas: Entrada[]) {
  const porMes = new Map<string, number>();
  for (const e of entradas) {
    const c = competenciaDe(e.operacao.dhFatoGerador);
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

async function gravar(
  c: PoolClient,
  imp: Importacao,
  notas: (Entrada & { roc: RespostaRoc })[],
  ocorrencias: Ocorrencia[],
  rocPath: string,
) {
  let itensTotal = 0;
  let itensErro = 0;
  const competencias = new Map<string, number>();

  for (let o = 0; o < notas.length; o++) {
    const { operacao: op, papel, arquivo, roc } = notas[o];
    const doc = await c.query<{ id: string; competencia: string }>(
      `insert into public.documentos (escritorio_id, empresa_id, importacao_id, tipo_dfe, chave_acesso, numero, serie,
         dh_emissao, dh_fato_gerador, uf, municipio, papel, arquivo_origem)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12)
       returning id, to_char(competencia, 'YYYY-MM-DD') as competencia`,
      [imp.escritorio_id, imp.empresa_id, imp.id, op.tipoDfe ?? "OPERACAO", op.chaveAcesso ?? null,
       op.numero ?? op.id ?? null, op.serie ?? null, op.dhFatoGerador, op.uf, op.municipio, papel, arquivo],
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
    roc.objetos.forEach((obj, i) => {
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
        `insert into public.erros_validacao (escritorio_id, empresa_id, importacao_id, documento_id, item_numero, codigo, campo, mensagem, arquivo_origem)
         select $1, $2, $3, $4, x.item_numero, x.codigo, x.campo, x.mensagem, $6
         from jsonb_to_recordset($5::jsonb) as x(item_numero int, codigo text, campo text, mensagem text)`,
        [imp.escritorio_id, imp.empresa_id, imp.id, docId, JSON.stringify(erros), arquivo],
      );
    }
  }

  await inserirOcorrencias(c, imp, ocorrencias);
  await c.query(
    `update public.importacoes set status = 'concluido', qtd_docs = $2, qtd_erros = $3, concluido_em = now(),
       mensagem_erro = $4 where id = $1`,
    [imp.id, notas.length, itensErro + contaComoErro(ocorrencias),
     contaComoErro(ocorrencias) ? `${contaComoErro(ocorrencias)} nota(s) com erro não foram calculadas` : null],
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
  return { docs: notas.length, itens: itensTotal, erros: itensErro };
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
