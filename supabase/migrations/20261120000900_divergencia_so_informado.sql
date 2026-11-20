-- Correção: tributo sem valor informado pelo ERP não é divergência (antes contava calculado − 0).
-- diferenca fica nula quando não há valor informado.
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
  case when t.informado is null then null else coalesce(t.calculado, 0) - t.informado end as diferenca
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
