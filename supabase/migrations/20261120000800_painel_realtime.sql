-- ApuraRTC — Painel (totais do mês) e status das importações em tempo real

-- Totais calculados por empresa × competência. Itens com erro entram na contagem, sem valor.
create view public.vw_totais_mensais
with (security_invoker = true)
as
select
  r.escritorio_id,
  r.empresa_id,
  r.competencia,
  count(*)::int                                                                   as qtd_itens,
  (count(*) filter (where r.estado_item in ('CALCULADO', 'CALCULO_SIMULADO')))::int as qtd_calculados,
  coalesce(sum(r.cbs_valor), 0)::numeric(15,2)     as cbs_total,
  coalesce(sum(r.ibs_uf_valor), 0)::numeric(15,2)  as ibs_uf_total,
  coalesce(sum(r.ibs_mun_valor), 0)::numeric(15,2) as ibs_mun_total,
  coalesce(sum(r.is_valor), 0)::numeric(15,2)      as is_total
from public.resultados_calculo r
group by r.escritorio_id, r.empresa_id, r.competencia;

-- Realtime: a tela de importação acompanha o status (respeita o RLS de quem assina).
alter publication supabase_realtime add table public.importacoes;
