-- ApuraRTC — Storage (arquivos originais e ROC) e fila de importação (pgmq)

-- Bucket privado. Caminho: {escritorio_id}/{empresa_id}/{importacoes|roc}/<arquivo>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'arquivos', 'arquivos', false, 52428800,  -- 50 MB
  array['application/json', 'application/xml', 'text/xml', 'text/plain', 'application/zip', 'application/gzip']
)
on conflict (id) do nothing;

create policy arquivos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'arquivos'
    and (storage.foldername(name))[2] in (select e::text from app.minhas_empresas() e)
  );

create policy arquivos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'arquivos'
    and (storage.foldername(name))[3] = 'importacoes'
    and (storage.foldername(name))[2] in (select e::text from app.minhas_empresas_escrita() e)
    and (storage.foldername(name))[1] in (
      select e.escritorio_id::text from public.empresas e
      where e.id::text = (storage.foldername(name))[2]
    )
  );

-- Fila consumida pelo worker (service_role / conexão direta).
select pgmq.create('importacoes');

create or replace function app.enfileirar_importacao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pgmq.send(
    'importacoes',
    jsonb_build_object('importacao_id', new.id, 'escritorio_id', new.escritorio_id, 'empresa_id', new.empresa_id)
  );
  return new;
end;
$$;
revoke all on function app.enfileirar_importacao() from public, anon, authenticated;

create trigger trg_importacoes_fila
  after insert on public.importacoes
  for each row execute function app.enfileirar_importacao();
