-- A mesma nota (chave de acesso) não pode entrar duas vezes para a mesma empresa e papel (evita contar em dobro).
create unique index documentos_chave_unica_idx
  on public.documentos (empresa_id, chave_acesso, papel)
  where chave_acesso is not null;
