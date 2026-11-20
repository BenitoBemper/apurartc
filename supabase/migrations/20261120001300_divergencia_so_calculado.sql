-- Item não calculado (inconsistência, falha) é erro de validação, não divergência: diferença fica nula.
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
  case when t.informado is null or not c.calculado then null else coalesce(t.calculado, 0) - t.informado end as diferenca,
  d.papel,
  d.numero        as documento_numero,
  d.importacao_id,
  i.ncm,
  i.nbs,
  i.cclasstrib,
  case when t.informado is null or not c.calculado then null else abs(coalesce(t.calculado, 0) - t.informado) end as diferenca_abs
from public.itens i
join public.documentos d
  on d.id = i.documento_id and d.competencia = i.competencia
join public.resultados_calculo r
  on r.item_id = i.id and r.competencia = i.competencia
cross join lateral (select r.estado_item in ('CALCULADO', 'CALCULO_SIMULADO') as calculado) as c
cross join lateral (values
  ('CBS',     i.cbs_informado,     r.cbs_valor),
  ('IBS_UF',  i.ibs_uf_informado,  r.ibs_uf_valor),
  ('IBS_MUN', i.ibs_mun_informado, r.ibs_mun_valor),
  ('IS',      i.is_informado,      r.is_valor)
) as t (tributo, informado, calculado)
where t.informado is not null or t.calculado is not null;
