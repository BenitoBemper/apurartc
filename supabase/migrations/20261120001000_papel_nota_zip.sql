-- ApuraRTC — Etapa 4: papel da nota (emitida = débito, recebida = crédito) e importação de ZIP com XMLs.

create type public.papel_nota as enum ('emitida', 'recebida');
alter type public.formato_importacao add value if not exists 'zip';

alter table public.documentos
  add column papel public.papel_nota not null default 'emitida',
  add column arquivo_origem text;                 -- nome do XML dentro do ZIP (ou do arquivo enviado)

alter table public.erros_validacao
  add column arquivo_origem text;

create index documentos_empresa_comp_papel_idx on public.documentos (empresa_id, competencia, papel);

-- Divergências: inclui papel e número da nota (colunas novas no fim → create or replace).
create or replace view public.vw_divergencias
with (security_invoker = true)
as
select
  i.escritorio_id,
  i.empresa_id,
  i.competencia,
  d.id            as documento_id,
  d.chave_acesso,
  i.id            as item_id,
  i.numero        as item_numero,
  r.estado_item,
  t.tributo,
  t.informado,
  t.calculado,
  case when t.informado is null then null else coalesce(t.calculado, 0) - t.informado end as diferenca,
  d.papel,
  d.numero        as documento_numero,
  d.importacao_id,
  i.ncm,
  i.nbs,
  i.cclasstrib
from public.itens i
join public.documentos d
  on d.id = i.documento_id and d.competencia = i.competencia
join public.resultados_calculo r
  on r.item_id = i.id and r.competencia = i.competencia
cross join lateral (values
  ('CBS',     i.cbs_informado,     r.cbs_valor),
  ('IBS_UF',  i.ibs_uf_informado,  r.ibs_uf_valor),
  ('IBS_MUN', i.ibs_mun_informado, r.ibs_mun_valor),
  ('IS',      i.is_informado,      r.is_valor)
) as t (tributo, informado, calculado)
where t.informado is not null or t.calculado is not null;

-- Totais por papel (o agrupamento muda → recriar).
drop view public.vw_totais_mensais;
create view public.vw_totais_mensais
with (security_invoker = true)
as
select
  r.escritorio_id,
  r.empresa_id,
  r.competencia,
  d.papel,
  count(*)::int                                                                   as qtd_itens,
  (count(*) filter (where r.estado_item in ('CALCULADO', 'CALCULO_SIMULADO')))::int as qtd_calculados,
  coalesce(sum(r.cbs_valor), 0)::numeric(15,2)     as cbs_total,
  coalesce(sum(r.ibs_uf_valor), 0)::numeric(15,2)  as ibs_uf_total,
  coalesce(sum(r.ibs_mun_valor), 0)::numeric(15,2) as ibs_mun_total,
  coalesce(sum(r.is_valor), 0)::numeric(15,2)      as is_total
from public.resultados_calculo r
join public.itens i on i.id = r.item_id and i.competencia = r.competencia
join public.documentos d on d.id = i.documento_id and d.competencia = i.competencia
group by r.escritorio_id, r.empresa_id, r.competencia, d.papel;
