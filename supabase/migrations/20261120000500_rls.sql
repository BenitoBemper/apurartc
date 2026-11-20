-- ApuraRTC — RLS
-- Regra: o usuário vê o que é dos seus escritórios; membros com linhas em membros_empresas veem só aqueles CNPJs.
-- Papéis: admin (tudo no escritório) | operador (importa) | leitor (só consulta).
-- Gravação de documentos/itens/resultados/erros é feita pelo worker (service_role, que ignora o RLS).
-- As funções são STABLE e usadas como "(select app.f())" nas políticas → avaliadas 1x por consulta.

create or replace function app.meus_escritorios()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.escritorio_id from public.membros m where m.user_id = auth.uid()
$$;

create or replace function app.meus_escritorios_admin()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.escritorio_id from public.membros m where m.user_id = auth.uid() and m.papel = 'admin'
$$;

create or replace function app.minhas_empresas()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select e.id
  from public.membros m
  join public.empresas e on e.escritorio_id = m.escritorio_id
  where m.user_id = auth.uid()
    and (
      not exists (select 1 from public.membros_empresas me where me.membro_id = m.id)
      or exists (select 1 from public.membros_empresas me where me.membro_id = m.id and me.empresa_id = e.id)
    )
$$;

create or replace function app.minhas_empresas_escrita()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select e.id
  from public.membros m
  join public.empresas e on e.escritorio_id = m.escritorio_id
  where m.user_id = auth.uid()
    and m.papel in ('admin', 'operador')
    and (
      not exists (select 1 from public.membros_empresas me where me.membro_id = m.id)
      or exists (select 1 from public.membros_empresas me where me.membro_id = m.id and me.empresa_id = e.id)
    )
$$;

revoke all on function app.meus_escritorios(), app.meus_escritorios_admin(),
  app.minhas_empresas(), app.minhas_empresas_escrita() from public, anon;
grant execute on function app.meus_escritorios(), app.meus_escritorios_admin(),
  app.minhas_empresas(), app.minhas_empresas_escrita() to authenticated, service_role;

-- Preenche escritorio_id a partir da empresa (o cliente só informa empresa_id).
create or replace function app.preencher_escritorio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select e.escritorio_id into new.escritorio_id from public.empresas e where e.id = new.empresa_id;
  if new.escritorio_id is null then
    raise exception 'empresa % não encontrada', new.empresa_id using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function app.preencher_escritorio() from public, anon, authenticated;

create trigger trg_importacoes_escritorio
  before insert on public.importacoes
  for each row execute function app.preencher_escritorio();

-- Onboarding: cria o escritório e torna o usuário admin dele.
create or replace function public.criar_escritorio(p_nome text, p_documento text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado' using errcode = '42501';
  end if;
  insert into public.escritorios (nome, documento) values (p_nome, p_documento) returning id into v_id;
  insert into public.membros (user_id, escritorio_id, papel) values (auth.uid(), v_id, 'admin');
  return v_id;
end;
$$;
revoke all on function public.criar_escritorio(text, text) from public, anon;
grant execute on function public.criar_escritorio(text, text) to authenticated;

-- ---------- Habilitar RLS em todas as tabelas ----------
alter table public.escritorios        enable row level security;
alter table public.empresas           enable row level security;
alter table public.membros            enable row level security;
alter table public.membros_empresas   enable row level security;
alter table public.api_chaves         enable row level security;
alter table public.importacoes        enable row level security;
alter table public.documentos         enable row level security;
alter table public.itens              enable row level security;
alter table public.resultados_calculo enable row level security;
alter table public.erros_validacao    enable row level security;
alter table public.auditoria          enable row level security;
alter table public.uso_mensal         enable row level security;

-- ---------- escritorios ----------
create policy escritorios_select on public.escritorios for select to authenticated
  using (id in (select app.meus_escritorios()));
create policy escritorios_update on public.escritorios for update to authenticated
  using (id in (select app.meus_escritorios_admin()))
  with check (id in (select app.meus_escritorios_admin()));

-- ---------- empresas ----------
create policy empresas_select on public.empresas for select to authenticated
  using (id in (select app.minhas_empresas()));
create policy empresas_insert on public.empresas for insert to authenticated
  with check (escritorio_id in (select app.meus_escritorios_admin()));
create policy empresas_update on public.empresas for update to authenticated
  using (escritorio_id in (select app.meus_escritorios_admin()))
  with check (escritorio_id in (select app.meus_escritorios_admin()));
create policy empresas_delete on public.empresas for delete to authenticated
  using (escritorio_id in (select app.meus_escritorios_admin()));

-- ---------- membros ----------
create policy membros_select on public.membros for select to authenticated
  using (escritorio_id in (select app.meus_escritorios()));
create policy membros_insert on public.membros for insert to authenticated
  with check (escritorio_id in (select app.meus_escritorios_admin()));
create policy membros_update on public.membros for update to authenticated
  using (escritorio_id in (select app.meus_escritorios_admin()))
  with check (escritorio_id in (select app.meus_escritorios_admin()));
create policy membros_delete on public.membros for delete to authenticated
  using (escritorio_id in (select app.meus_escritorios_admin()));

-- ---------- membros_empresas ----------
create policy membros_empresas_select on public.membros_empresas for select to authenticated
  using (escritorio_id in (select app.meus_escritorios()));
create policy membros_empresas_insert on public.membros_empresas for insert to authenticated
  with check (escritorio_id in (select app.meus_escritorios_admin()));
create policy membros_empresas_delete on public.membros_empresas for delete to authenticated
  using (escritorio_id in (select app.meus_escritorios_admin()));

-- ---------- api_chaves (só admin) ----------
create policy api_chaves_select on public.api_chaves for select to authenticated
  using (escritorio_id in (select app.meus_escritorios_admin()));
create policy api_chaves_insert on public.api_chaves for insert to authenticated
  with check (escritorio_id in (select app.meus_escritorios_admin()));
create policy api_chaves_update on public.api_chaves for update to authenticated
  using (escritorio_id in (select app.meus_escritorios_admin()))
  with check (escritorio_id in (select app.meus_escritorios_admin()));

-- ---------- importação e cálculo ----------
create policy importacoes_select on public.importacoes for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy importacoes_insert on public.importacoes for insert to authenticated
  with check (
    empresa_id in (select app.minhas_empresas_escrita())
    and criado_por = auth.uid()
    and status = 'recebido'
  );

create policy documentos_select on public.documentos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy itens_select on public.itens for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy resultados_select on public.resultados_calculo for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy erros_validacao_select on public.erros_validacao for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));

-- ---------- suporte ----------
create policy auditoria_select on public.auditoria for select to authenticated
  using (escritorio_id in (select app.meus_escritorios_admin()));
create policy uso_mensal_select on public.uso_mensal for select to authenticated
  using (escritorio_id in (select app.meus_escritorios()));

-- anon não acessa nada do app
revoke all on all tables in schema public from anon;
