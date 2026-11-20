// Esquemas da API /api/v1: validam as requisições e geram a especificação OpenAPI (mesma fonte).
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const cnpj = z.string().regex(/^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/).openapi({ example: "12345678000195", description: "CNPJ da empresa" });
const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).openapi({ example: "2027-03", description: "Competência AAAA-MM" });
const dinheiro = z.number().openapi({ example: 56.76 });
const uuid = z.string().uuid().openapi({ example: "739df046-3757-4cc5-8bd8-51b994f95b11" });

export const Erro = z.object({ erro: z.object({ codigo: z.string(), mensagem: z.string() }) }).openapi("Erro");

export const StatusImportacao = z.enum(["recebido", "validando", "processando", "concluido", "erro"]).openapi("StatusImportacao");

export const Importacao = z.object({
  id: uuid,
  cnpj: z.string(),
  formato: z.enum(["json", "xml_nfe", "zip"]),
  status: StatusImportacao,
  notas: z.number().int().openapi({ description: "Notas calculadas" }),
  erros: z.number().int(),
  mensagem: z.string().nullable(),
  criado_em: z.string().datetime({ offset: true }),
  concluido_em: z.string().datetime({ offset: true }).nullable(),
  ocorrencias: z.array(z.object({
    codigo: z.string().openapi({ example: "REG-011" }), campo: z.string().nullable(), mensagem: z.string(),
    arquivo: z.string().nullable(), nota_id: z.string().nullable(), item: z.number().int().nullable(),
  })).optional(),
}).openapi("Importacao");

export const Tributo = z.object({ informado: dinheiro.nullable(), calculado: dinheiro.nullable(), diferenca: dinheiro.nullable() }).openapi("ValorTributo");

export const Resultado = z.object({
  importacao_id: uuid,
  pagina: z.number().int(),
  total_notas: z.number().int(),
  notas: z.array(z.object({
    id: uuid, chave_acesso: z.string().nullable(), numero: z.string().nullable(), papel: z.enum(["emitida", "recebida"]),
    competencia: competencia,
    itens: z.array(z.object({
      numero: z.number().int(), ncm: z.string().nullable(), nbs: z.string().nullable(), cclasstrib: z.string().nullable(),
      estado: z.string().openapi({ example: "CALCULO_SIMULADO" }),
      tributos: z.record(z.enum(["CBS", "IBS_UF", "IBS_MUN", "IS"]), Tributo),
    })),
  })),
}).openapi("Resultado");

const Valores = z.object({ cbs: dinheiro, ibs_uf: dinheiro, ibs_mun: dinheiro, is: dinheiro });
export const Apuracao = z.object({
  cnpj: z.string(), competencia,
  debito: Valores.openapi({ description: "Notas emitidas" }),
  credito: Valores.openapi({ description: "Notas recebidas (IS não gera crédito)" }),
  saldo: Valores.openapi({ description: "Débito − crédito. Negativo = saldo credor" }),
  notas: z.object({ emitidas: z.number().int(), recebidas: z.number().int() }),
  itens: z.object({ total: z.number().int(), calculados: z.number().int() }),
  divergencias: z.number().int(),
  calculadora: z.string().nullable(),
}).openapi("Apuracao");

export const Divergencias = z.object({
  pagina: z.number().int(), total: z.number().int(),
  itens: z.array(z.object({
    nota_id: uuid, importacao_id: uuid, chave_acesso: z.string().nullable(), numero: z.string().nullable(),
    papel: z.enum(["emitida", "recebida"]), item: z.number().int(), tributo: z.enum(["CBS", "IBS_UF", "IBS_MUN", "IS"]),
    informado: dinheiro, calculado: dinheiro.nullable(), diferenca: dinheiro,
  })),
}).openapi("Divergencias");

// ---------- parâmetros ----------
export const QueryApuracao = z.object({ cnpj, competencia });
export const QueryDivergencias = z.object({
  cnpj, competencia,
  tributo: z.enum(["CBS", "IBS_UF", "IBS_MUN", "IS"]).optional(),
  papel: z.enum(["emitida", "recebida"]).optional(),
  minimo: z.coerce.number().min(0.01).default(0.01).openapi({ description: "Diferença mínima em R$ (absoluta)" }),
  pagina: z.coerce.number().int().min(1).default(1),
});
export const QueryResultado = z.object({ pagina: z.coerce.number().int().min(1).default(1) });
export const PathId = z.object({ id: uuid });

// ---------- documentação ----------
const registro = new OpenAPIRegistry();
const seguranca = registro.registerComponent("securitySchemes", "chaveApi", {
  type: "http", scheme: "bearer", bearerFormat: "artc_…", description: "Chave criada em Configurações → Chaves da API",
});
const erros = {
  400: { description: "Parâmetros inválidos", content: { "application/json": { schema: Erro } } },
  401: { description: "Chave ausente, inválida ou revogada", content: { "application/json": { schema: Erro } } },
  403: { description: "Chave sem o escopo necessário", content: { "application/json": { schema: Erro } } },
  404: { description: "Não encontrado (ou fora do escritório/empresa da chave)", content: { "application/json": { schema: Erro } } },
  429: { description: "Mais de 60 requisições por minuto (veja Retry-After)", content: { "application/json": { schema: Erro } } },
};
const sec = [{ [seguranca.name]: [] }];

registro.registerPath({
  method: "post", path: "/importacoes", tags: ["Importação"], security: sec,
  summary: "Envia um arquivo para cálculo (escopo importar)",
  description: "JSON no layout OperacaoInput (+ campos do ApuraRTC), XML de NF-e/NFC-e ou ZIP de XMLs. " +
    "Envie como multipart/form-data (campos `cnpj` e `arquivo`) ou o corpo puro com `?cnpj=` (e `?nome=` para XML/ZIP). " +
    "O processamento é assíncrono: consulte `GET /importacoes/{id}`.",
  request: {
    query: z.object({ cnpj: cnpj.optional(), nome: z.string().optional().openapi({ example: "notas-marco.zip" }) }),
    body: {
      content: {
        "multipart/form-data": { schema: z.object({ cnpj, arquivo: z.string().openapi({ format: "binary" }) }) },
        "application/json": { schema: z.object({}).passthrough().openapi({ description: "OperacaoInput (ou lista)" }) },
        "application/xml": { schema: z.string() },
        "application/zip": { schema: z.string().openapi({ format: "binary" }) },
      },
    },
  },
  responses: {
    202: { description: "Recebido e na fila", content: { "application/json": { schema: Importacao } } },
    409: { description: "Arquivo já importado (mesmo conteúdo)", content: { "application/json": { schema: Erro } } },
    413: { description: "Arquivo maior que 50 MB", content: { "application/json": { schema: Erro } } },
    ...erros,
  },
});
registro.registerPath({
  method: "get", path: "/importacoes/{id}", tags: ["Importação"], security: sec,
  summary: "Status e ocorrências da importação (escopo consultar)",
  request: { params: PathId },
  responses: { 200: { description: "Importação", content: { "application/json": { schema: Importacao } } }, ...erros },
});
registro.registerPath({
  method: "get", path: "/importacoes/{id}/resultado", tags: ["Importação"], security: sec,
  summary: "Notas e itens calculados, com o informado pelo ERP (escopo consultar)",
  description: "Paginado: 100 notas por página.",
  request: { params: PathId, query: QueryResultado },
  responses: { 200: { description: "Resultado", content: { "application/json": { schema: Resultado } } }, ...erros },
});
registro.registerPath({
  method: "get", path: "/apuracao", tags: ["Apuração"], security: sec,
  summary: "Débito, crédito e saldo do mês por tributo (escopo consultar)",
  request: { query: QueryApuracao },
  responses: { 200: { description: "Apuração", content: { "application/json": { schema: Apuracao } } }, ...erros },
});
registro.registerPath({
  method: "get", path: "/divergencias", tags: ["Apuração"], security: sec,
  summary: "Divergências ERP × calculadora, maior diferença primeiro (escopo consultar)",
  description: "Paginado: 100 por página.",
  request: { query: QueryDivergencias },
  responses: { 200: { description: "Divergências", content: { "application/json": { schema: Divergencias } } }, ...erros },
});

export function especificacaoOpenApi(servidor: string) {
  return new OpenApiGeneratorV31(registro.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "ApuraRTC API",
      version: "1.0.0",
      description: "Cálculo e apuração de IBS/CBS com a calculadora oficial da Receita Federal. " +
        "Autenticação: `Authorization: Bearer artc_…`. Limite: 60 requisições por minuto por chave.",
    },
    servers: [{ url: `${servidor}/api/v1` }],
  });
}

/** Converte erros do zod em mensagem curta. */
export function mensagemZod(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join(".") || "parâmetro"}: ${i.message}`).join("; ");
}
