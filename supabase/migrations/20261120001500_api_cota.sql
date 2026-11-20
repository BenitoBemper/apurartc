-- ApuraRTC — API pública: limite de requisições por chave e por minuto (contador no Postgres).

create table public.api_uso (
  chave_id  uuid not null references public.api_chaves (id) on delete cascade,
  minuto    timestamptz not null,
  contagem  integer not null default 0,
  primary key (chave_id, minuto)
);
alter table public.api_uso enable row level security; -- sem políticas: só o service_role acessa
revoke all on public.api_uso from anon, authenticated;

-- Soma 1 ao minuto atual e diz se ainda está dentro do limite. Limpa minutos com mais de 1 hora.
create or replace function public.api_consumir_cota(p_chave uuid, p_limite integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_contagem integer;
begin
  insert into public.api_uso as u (chave_id, minuto, contagem)
  values (p_chave, date_trunc('minute', now()), 1)
  on conflict (chave_id, minuto) do update set contagem = u.contagem + 1
  returning contagem into v_contagem;

  delete from public.api_uso where chave_id = p_chave and minuto < now() - interval '1 hour';
  return v_contagem <= p_limite;
end;
$$;
revoke all on function public.api_consumir_cota(uuid, integer) from public, anon, authenticated;
grant execute on function public.api_consumir_cota(uuid, integer) to service_role;
