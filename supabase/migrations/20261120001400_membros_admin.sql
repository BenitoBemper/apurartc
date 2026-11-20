-- ApuraRTC — Configurações: proteção do último admin e busca de usuário por e-mail (convite).

-- O escritório nunca fica sem admin. AFTER: quando o próprio escritório é excluído (cascata), ele já não existe e a regra não se aplica.
create or replace function app.garantir_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.papel = 'admin'
     and exists (select 1 from public.escritorios e where e.id = old.escritorio_id)
     and not exists (select 1 from public.membros m where m.escritorio_id = old.escritorio_id and m.papel = 'admin') then
    raise exception 'o escritório precisa de ao menos um administrador' using errcode = 'P0001';
  end if;
  return null;
end;
$$;
revoke all on function app.garantir_admin() from public, anon, authenticated;

create trigger trg_membros_ultimo_admin
  after update of papel or delete on public.membros
  for each row execute function app.garantir_admin();

-- Convite: o servidor (service_role) descobre se o e-mail já tem conta.
create or replace function app.usuario_por_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;
revoke all on function app.usuario_por_email(text) from public, anon, authenticated;
grant execute on function app.usuario_por_email(text) to service_role;

-- Exposto ao PostgREST só para service_role (o schema app não é exposto).
create or replace function public.usuario_por_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select app.usuario_por_email(p_email)
$$;
revoke all on function public.usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_por_email(text) to service_role;

