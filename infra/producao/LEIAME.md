# Deploy do ApuraRTC (produção)

Tudo em **São Paulo**: Supabase (banco, login, arquivos, fila) · Vercel (site + API) · Oracle Cloud Free (calculadora + worker).
A calculadora não fica exposta na internet: só o worker fala com ela.

> Segredos (senha do banco, chave secreta, senha SMTP) são colados **por você** nos painéis/servidor. Nunca no Git.

---

## 1. Supabase (nuvem)
1. supabase.com → New project → nome `apurartc`, região **South America (São Paulo)**, gere e guarde a **senha do banco**.
2. No seu PC (pasta `apurartc`): `npx supabase login` (abre o navegador).
3. Aplicar o banco (feito pelo Claude, com o ref do projeto): `npx supabase link --project-ref <ref>` e `npx supabase db push` (só as migrations; **sem** os dados de teste).
4. Authentication → URL Configuration:
   - Site URL: `https://<seu-app>.vercel.app`
   - Redirect URLs: `https://<seu-app>.vercel.app/**`
5. Authentication → Emails → Templates → **Invite user**: assunto `Convite para o ApuraRTC` e o conteúdo de `supabase/templates/convite.html`
   (troque `{{ .SiteURL }}` se usar domínio próprio; o resto fica igual).
6. Authentication → Emails → SMTP Settings (Resend): host `smtp.resend.com`, porta `465`, usuário `resend`, senha = **API key do Resend**,
   remetente `onboarding@resend.dev` (até ter domínio próprio verificado no Resend).

## 2. Vercel (site)
1. vercel.com → Add New → Project → importar `apurartc` do GitHub.
2. **Root Directory**: `apps/web` (Framework: Next.js). Deixe marcado "Include files outside the root directory".
3. Environment Variables (Production):
   | Nome | Onde pegar |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys → publishable |
   | `SUPABASE_SECRET_KEY` | Supabase → API Keys → secret (**só aqui e no servidor**) |
4. Deploy. Depois: Settings → Functions → Region **São Paulo (gru1)** e faça Redeploy.

## 3. Oracle Cloud (calculadora + worker)
1. cloud.oracle.com → Compute → Instances → Create:
   - Imagem **Ubuntu 24.04**, shape **Ampere A1 (VM.Standard.A1.Flex)**: 2 OCPU, 12 GB (dentro do gratuito).
   - Baixe a chave SSH gerada (ou cole a sua). Não precisa abrir portas além da 22 (SSH).
2. Conecte: `ssh -i <chave> ubuntu@<ip-publico>` (ou o Cloud Shell da Oracle).
3. Cole este bloco no servidor (cria uma chave só de leitura para o repositório privado):
   ```bash
   sudo mkdir -p /opt/apurartc && sudo chown "$USER" /opt/apurartc
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/apurartc_deploy -C apurartc-servidor
   printf 'Host github.com\n  IdentityFile ~/.ssh/apurartc_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
   ssh-keyscan github.com >> ~/.ssh/known_hosts
   cat ~/.ssh/apurartc_deploy.pub
   ```
4. Copie a linha `ssh-ed25519 …` e cole em GitHub → repositório `apurartc` → Settings → **Deploy keys** → Add (deixe **sem** "Allow write access").
5. De volta ao servidor:
   ```bash
   git clone git@github.com:BenitoBemper/apurartc.git /opt/apurartc/apurartc
   bash /opt/apurartc/apurartc/infra/producao/instalar-servidor.sh
   nano /opt/apurartc/apurartc/infra/producao/.env.producao   # preencher (ver .env.example)
   bash /opt/apurartc/apurartc/infra/producao/instalar-servidor.sh
   ```
   - `DATABASE_URL`: Supabase → Connect → **Session pooler** (porta 5432), com a senha do banco.
6. Atualizar depois (código ou versão da calculadora): `CALC_TAG=<nova> bash /opt/apurartc/apurartc/infra/producao/instalar-servidor.sh`.

## 4. Conferência
- Site abre, cria conta (o e-mail de confirmação chega via Resend), cria escritório e empresa.
- Importar `infra/calculadora/exemplos/operacao.json` → status Concluído → Painel com CBS R$ 56,76.
- Servidor: `docker compose -f /opt/apurartc/apurartc/infra/producao/docker-compose.yml logs -f worker`.
