// Formato público (estável) dos objetos da API — não expõe colunas internas.
type LinhaImportacao = {
  id: string; formato: string; status: string; qtd_docs: number; qtd_erros: number;
  mensagem_erro: string | null; criado_em: string; concluido_em: string | null;
};
type LinhaOcorrencia = {
  codigo: string; campo: string | null; mensagem: string; arquivo_origem: string | null; documento_id: string | null; item_numero: number | null;
};

export function serializarImportacao(i: LinhaImportacao, cnpj: string, ocorrencias?: LinhaOcorrencia[]) {
  return {
    id: i.id,
    cnpj,
    formato: i.formato,
    status: i.status,
    notas: i.qtd_docs,
    erros: i.qtd_erros,
    mensagem: i.mensagem_erro,
    criado_em: i.criado_em,
    concluido_em: i.concluido_em,
    ...(ocorrencias && {
      ocorrencias: ocorrencias.map((o) => ({
        codigo: o.codigo, campo: o.campo, mensagem: o.mensagem, arquivo: o.arquivo_origem, nota_id: o.documento_id, item: o.item_numero,
      })),
    }),
  };
}

export const num = (v: number | string | null) => (v === null ? null : Number(v));
