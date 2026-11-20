-- ApuraRTC — multi-tenant: escritório → empresas (CNPJs) → membros
-- FKs compostas (id, escritorio_id) garantem que nada aponte para outro escritório.

create table public.escritorios (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (length(trim(nome)) > 0),
  documento  varchar(14) check (documento ~ '^(\d{11}|\d{14})$'),  -- CPF ou CNPJ
  plano      text not null default 'gratuito',
  criado_em  timestamptz not null default now()
);

create table public.empresas (
  id              uuid primary key default gen_random_uuid(),
  escritorio_id   uuid not null references public.escritorios (id) on delete cascade,
  cnpj            char(14) not null check (cnpj ~ '^\d{14}$'),
  cnpj_base       char(8) generated always as (left(cnpj, 8)) stored,  -- usado pela API da RFB ({cnpj} de 8 dígitos)
  razao_social    text not null,
  uf              char(2),
  municipio_ibge  integer,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  unique (escritorio_id, cnpj),
  unique (id, escritorio_id)
);
create index empresas_cnpj_base_idx on public.empresas (cnpj_base);

create table public.membros (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  escritorio_id  uuid not null references public.escritorios (id) on delete cascade,
  papel          public.papel_membro not null default 'leitor',
  criado_em      timestamptz not null default now(),
  unique (user_id, escritorio_id),
  unique (id, escritorio_id)
);
create index membros_escritorio_idx on public.membros (escritorio_id);

-- Restringe o membro a CNPJs específicos. Sem linhas = acesso a todas as empresas do escritório.
create table public.membros_empresas (
  membro_id      uuid not null,
  empresa_id     uuid not null,
  escritorio_id  uuid not null,
  criado_em      timestamptz not null default now(),
  primary key (membro_id, empresa_id),
  foreign key (membro_id, escritorio_id) references public.membros (id, escritorio_id) on delete cascade,
  foreign key (empresa_id, escritorio_id) references public.empresas (id, escritorio_id) on delete cascade
);
create index membros_empresas_empresa_idx on public.membros_empresas (empresa_id);

-- Chaves da API pública do SaaS: só o hash é guardado.
create table public.api_chaves (
  id             uuid primary key default gen_random_uuid(),
  escritorio_id  uuid not null references public.escritorios (id) on delete cascade,
  empresa_id     uuid,
  nome           text not null,
  prefixo        varchar(12) not null,             -- exibição (ex.: "artc_ab12")
  hash_chave     text not null unique,              -- sha256 da chave
  escopos        text[] not null default '{}',
  ultimo_uso     timestamptz,
  revogada_em    timestamptz,
  criado_por     uuid references auth.users (id) on delete set null,
  criado_em      timestamptz not null default now(),
  foreign key (empresa_id, escritorio_id) references public.empresas (id, escritorio_id) on delete cascade
);
create index api_chaves_escritorio_idx on public.api_chaves (escritorio_id);
