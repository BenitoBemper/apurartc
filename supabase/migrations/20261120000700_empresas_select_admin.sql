-- Correção: INSERT ... RETURNING em empresas falhava para o admin.
-- O RETURNING exige a política de SELECT, e app.minhas_empresas() (STABLE) usa o snapshot do início do comando,
-- em que a empresa recém-inserida ainda não existe. O admin vê todas as empresas do escritório pelo escritorio_id.
drop policy empresas_select on public.empresas;
create policy empresas_select on public.empresas for select to authenticated
  using (
    id in (select app.minhas_empresas())
    or escritorio_id in (select app.meus_escritorios_admin())
  );
