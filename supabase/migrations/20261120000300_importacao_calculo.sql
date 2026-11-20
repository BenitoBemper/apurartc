-- ApuraRTC — importação e cálculo (MVP)
-- competencia = 1º dia do mês (date). Regra: data do fato gerador; se vazia, data de emissão (fuso de Brasília).
-- itens e resultados_calculo são particionados por competência (partições no schema "particoes").

create table public.importacoes (
  id             uuid primary key default gen_random_uuid(),
  escritorio_id  uuid not null,
  empresa_id     uuid not null,
  origem         public.origem_importacao not null default 'upload',
  formato        public.formato_importacao not null,
  arquivo_path   text not null,                       -- Storage: {escritorio_id}/{empresa_id}/importacoes/...
  hash_sha256    char(64) not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  status         public.status_importacao not null default 'recebido',
  qtd_docs       integer not null default 0,
  qtd_erros      integer not null default 0,
  mensagem_erro  text,
  criado_por     uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  concluido_em   timestamptz,
  foreign key (empresa_id, escritorio_id) references public.empresas (id, escritorio_id) on delete cascade,
  unique (empresa_id, hash_sha256),                   -- arquivo duplicado: bloquear e avisar
  unique (id, escritorio_id, empresa_id)
);
create index importacoes_empresa_idx on public.importacoes (empresa_id, criado_em desc);

create table public.documentos (
  id               uuid primary key default gen_random_uuid(),
  escritorio_id    uuid not null,
  empresa_id       uuid not null,
  importacao_id    uuid not null,
  tipo_dfe         text not null,                     -- ex.: NFE, NFCE, NFSE
  chave_acesso     varchar(50),
  numero           text,
  serie            text,
  dh_emissao       timestamptz not null,
  dh_fato_gerador  timestamptz,
  competencia      date generated always as (
                     date_trunc('month', coalesce(dh_fato_gerador, dh_emissao) at time zone 'America/Sao_Paulo')::date
                   ) stored,
  uf               char(2),
  municipio        integer,
  status           text not null default 'importado',
  criado_em        timestamptz not null default now(),
  foreign key (importacao_id, escritorio_id, empresa_id)
    references public.importacoes (id, escritorio_id, empresa_id) on delete cascade,
  unique (id, escritorio_id, empresa_id, competencia)
);
create index documentos_empresa_comp_idx on public.documentos (empresa_id, competencia);
create index documentos_importacao_idx on public.documentos (importacao_id);
create index documentos_chave_idx on public.documentos (chave_acesso);

create table public.itens (
  id             uuid not null default gen_random_uuid(),
  competencia    date not null,
  escritorio_id  uuid not null,
  empresa_id     uuid not null,
  documento_id   uuid not null,
  numero         integer not null,
  ncm            varchar(8),
  nbs            varchar(9),
  cst            varchar(3),
  cclasstrib     varchar(6),
  base_calculo   numeric(15,2),
  quantidade     numeric(15,4),
  unidade        text,
  -- valores informados pelo ERP (para a divergência)
  cbs_informado      numeric(15,2),
  ibs_uf_informado   numeric(15,2),
  ibs_mun_informado  numeric(15,2),
  is_informado       numeric(15,2),
  criado_em      timestamptz not null default now(),
  primary key (id, competencia),
  unique (documento_id, numero, competencia),
  foreign key (documento_id, escritorio_id, empresa_id, competencia)
    references public.documentos (id, escritorio_id, empresa_id, competencia) on delete cascade
) partition by range (competencia);
create index itens_empresa_comp_idx on public.itens (empresa_id, competencia);

create table public.resultados_calculo (
  id                  uuid not null default gen_random_uuid(),
  competencia         date not null,
  escritorio_id       uuid not null,
  empresa_id          uuid not null,
  item_id             uuid not null,
  versao_calculadora  text not null,                  -- ex.: 1.6.1
  versao_base         text not null,                  -- ex.: V0059
  estado_item         public.estado_item not null,
  cbs_aliquota        numeric(7,4),
  cbs_valor           numeric(15,2),
  ibs_uf_aliquota     numeric(7,4),
  ibs_uf_valor        numeric(15,2),
  ibs_mun_aliquota    numeric(7,4),
  ibs_mun_valor       numeric(15,2),
  is_aliquota         numeric(7,4),
  is_valor            numeric(15,2),
  roc_path            text,                           -- JSON completo (ROC + memória) no Storage
  criado_em           timestamptz not null default now(),
  primary key (id, competencia),
  unique (item_id, competencia),                      -- recálculo substitui o resultado
  foreign key (item_id, competencia) references public.itens (id, competencia) on delete cascade
) partition by range (competencia);
create index resultados_empresa_comp_idx on public.resultados_calculo (empresa_id, competencia);

create table public.erros_validacao (
  id             uuid primary key default gen_random_uuid(),
  escritorio_id  uuid not null,
  empresa_id     uuid not null,
  importacao_id  uuid not null,
  documento_id   uuid references public.documentos (id) on delete cascade,
  item_numero    integer,                             -- itens é particionado: referência pelo número do item
  codigo         text not null,                       -- ex.: REG-011
  campo          text,                                -- ex.: #/itens/3/ncm
  mensagem       text not null,
  criado_em      timestamptz not null default now(),
  foreign key (importacao_id, escritorio_id, empresa_id)
    references public.importacoes (id, escritorio_id, empresa_id) on delete cascade
);
create index erros_validacao_importacao_idx on public.erros_validacao (importacao_id);

-- Partições mensais (+ default). Executar antes do mês chegar; o que cair na default precisa ser movido
-- antes de criar a partição daquele mês.
create or replace function app.criar_particoes(p_inicio date, p_meses integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes    date;
  v_tabela text;
  v_nome   text;
begin
  for i in 0 .. p_meses - 1 loop
    v_mes := (date_trunc('month', p_inicio) + make_interval(months => i))::date;
    foreach v_tabela in array array['itens', 'resultados_calculo'] loop
      v_nome := format('%s_%s', v_tabela, to_char(v_mes, 'YYYY_MM'));
      execute format(
        'create table if not exists particoes.%I partition of public.%I for values from (%L) to (%L)',
        v_nome, v_tabela, v_mes, (v_mes + interval '1 month')::date);
      execute format('alter table particoes.%I enable row level security', v_nome);
    end loop;
  end loop;
end;
$$;
revoke all on function app.criar_particoes(date, integer) from public, anon, authenticated;

create table particoes.itens_default partition of public.itens default;
create table particoes.resultados_calculo_default partition of public.resultados_calculo default;
alter table particoes.itens_default enable row level security;
alter table particoes.resultados_calculo_default enable row level security;

-- Jan/2026 a dez/2027
select app.criar_particoes('2026-01-01', 24);

-- Divergência item × tributo: informado (ERP) × calculado (calculadora). Respeita o RLS de quem consulta.
create view public.vw_divergencias
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
  coalesce(t.calculado, 0) - coalesce(t.informado, 0) as diferenca
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
