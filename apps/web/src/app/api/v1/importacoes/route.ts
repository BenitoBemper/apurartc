import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { auditar, autenticar, erro, resolverEmpresa } from "@/lib/api/base";
import { serializarImportacao } from "@/lib/api/serializar";

export const runtime = "nodejs";
const TAMANHO_MAX = 50 * 1024 * 1024;

function formatoDe(nome: string, tipo: string): { formato: "json" | "xml_nfe" | "zip"; contentType: string } | null {
  if (/\.json$/i.test(nome) || tipo.includes("json")) return { formato: "json", contentType: "application/json" };
  if (/\.xml$/i.test(nome) || tipo.includes("xml")) return { formato: "xml_nfe", contentType: "application/xml" };
  if (/\.zip$/i.test(nome) || tipo.includes("zip")) return { formato: "zip", contentType: "application/zip" };
  return null;
}

// POST /api/v1/importacoes — multipart (cnpj + arquivo) ou corpo puro com ?cnpj=&nome=
export async function POST(req: NextRequest) {
  const ctx = await autenticar(req, "importar");
  if (ctx instanceof NextResponse) return ctx;

  const tipo = req.headers.get("content-type") ?? "";
  let cnpj = req.nextUrl.searchParams.get("cnpj");
  let nome = req.nextUrl.searchParams.get("nome") ?? "";
  let dados: Uint8Array;

  if (Number(req.headers.get("content-length") ?? 0) > TAMANHO_MAX) return erro(413, "ARQUIVO_GRANDE", "Máximo de 50 MB.");
  if (tipo.startsWith("multipart/form-data")) {
    const form = await req.formData();
    const arq = form.get("arquivo");
    cnpj = String(form.get("cnpj") ?? cnpj ?? "");
    if (!(arq instanceof File)) return erro(400, "ARQUIVO_AUSENTE", "Envie o arquivo no campo `arquivo`.");
    nome = arq.name;
    dados = new Uint8Array(await arq.arrayBuffer());
  } else {
    dados = new Uint8Array(await req.arrayBuffer());
    if (!nome) nome = tipo.includes("json") ? "api.json" : tipo.includes("zip") ? "api.zip" : "api.xml";
  }
  if (!dados.length) return erro(400, "ARQUIVO_VAZIO", "O arquivo está vazio.");
  if (dados.length > TAMANHO_MAX) return erro(413, "ARQUIVO_GRANDE", "Máximo de 50 MB.");

  const f = formatoDe(nome, tipo);
  if (!f) return erro(400, "FORMATO_INVALIDO", "Use JSON, XML (NF-e/NFC-e) ou ZIP.");

  const empresa = await resolverEmpresa(ctx, cnpj);
  if (empresa instanceof NextResponse) return empresa;

  const hash = createHash("sha256").update(dados).digest("hex");
  const { data: existente } = await ctx.admin.from("importacoes").select("id")
    .eq("empresa_id", empresa.id).eq("hash_sha256", hash).maybeSingle();
  if (existente) return erro(409, "ARQUIVO_DUPLICADO", `Este arquivo já foi importado (id ${existente.id}).`);

  const seguro = nome.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const path = `${ctx.chave.escritorioId}/${empresa.id}/importacoes/${randomUUID()}__${seguro}`;
  const up = await ctx.admin.storage.from("arquivos").upload(path, dados, { contentType: f.contentType });
  if (up.error) return erro(500, "FALHA_ARMAZENAMENTO", up.error.message);

  const { data: imp, error } = await ctx.admin.from("importacoes")
    .insert({ escritorio_id: ctx.chave.escritorioId, empresa_id: empresa.id, origem: "api", formato: f.formato,
      arquivo_path: path, hash_sha256: hash, criado_por: null })
    .select("id, formato, status, qtd_docs, qtd_erros, mensagem_erro, criado_em, concluido_em")
    .single();
  if (error) {
    await ctx.admin.storage.from("arquivos").remove([path]);
    return error.code === "23505" ? erro(409, "ARQUIVO_DUPLICADO", "Este arquivo já foi importado.") : erro(500, "FALHA", error.message);
  }
  await auditar(ctx, "api.importar", "importacao", imp.id, { arquivo: seguro, bytes: dados.length });
  return NextResponse.json(serializarImportacao(imp, empresa.cnpj), {
    status: 202,
    headers: { Location: `/api/v1/importacoes/${imp.id}` },
  });
}
