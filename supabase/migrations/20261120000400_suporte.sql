-- ApuraRTC — suporte: auditoria e uso mensal (base dos planos)

create table public.auditoria (
  id             bigint generated always as identity primary key,
  escritorio_id  uuid references public.escritorios (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  acao           text not null,                      -- ex.: credencial.criar, importacao.excluir, exportacao
  entidade       text not null,
  entidade_id    text,
  ip             inet,
  detalhes       jsonb,
  criado_em      timestamptz not null default now()
);
create index auditoria_escritorio_idx on public.auditoria (escritorio_id, criado_em desc);

create table public.uso_mensal (
  escritorio_id  uuid not null references public.escritorios (id) on delete cascade,
  competencia    date not null check (extract(day from competencia) = 1),
  qtd_notas      integer not null default 0,
  qtd_cnpjs      integer not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (escritorio_id, competencia)
);
