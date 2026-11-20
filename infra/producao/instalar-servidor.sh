#!/usr/bin/env bash
# Instala/atualiza a calculadora oficial + worker do ApuraRTC no servidor (Ubuntu 22.04/24.04, ARM ou x86).
# Idempotente: rodar de novo atualiza o código e reinicia os containers.
# Uso (a partir de /opt/apurartc/apurartc):  bash infra/producao/instalar-servidor.sh
set -euo pipefail

CALC_TAG="${CALC_TAG:-1.6.1}"   # versão oficial da calculadora (tag do GitHub da Receita)
CALC_REPO="https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git"
BASE="$(cd "$(dirname "$0")/../../.." && pwd)"   # /opt/apurartc
APP="$BASE/apurartc"
CALC="$BASE/calculadora-rtc-regime-regular"
ENV_FILE="$APP/infra/producao/.env.producao"

passo() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

passo "1/5 Docker"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-v2 git
  sudo systemctl enable --now docker
fi
DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"
$DOCKER --version

passo "2/5 Código do ApuraRTC"
git -C "$APP" pull --ff-only

passo "3/5 Calculadora oficial (tag $CALC_TAG, sem modificação)"
if [ ! -d "$CALC/.git" ]; then
  git clone --depth 1 --branch "$CALC_TAG" "$CALC_REPO" "$CALC"
else
  git -C "$CALC" fetch --depth 1 origin "refs/tags/$CALC_TAG:refs/tags/$CALC_TAG"
  git -C "$CALC" checkout --quiet "$CALC_TAG"
fi
test -z "$(git -C "$CALC" status --porcelain)" || { echo "A calculadora tem alterações locais: abortando (ela deve ficar igual à oficial)."; exit 1; }
echo "calculadora em $(git -C "$CALC" describe --tags)"

passo "4/5 Configuração (.env.producao)"
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP/infra/producao/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Criei $ENV_FILE. Preencha com:  nano $ENV_FILE"
  echo "Depois rode este script de novo."
  exit 0
fi
chmod 600 "$ENV_FILE"
grep -qE '^SUPABASE_SECRET_KEY=.+' "$ENV_FILE" || { echo "Falta SUPABASE_SECRET_KEY em $ENV_FILE"; exit 1; }
grep -q '<senha-do-banco>' "$ENV_FILE" && { echo "Troque <senha-do-banco> e <ref-do-projeto> em $ENV_FILE"; exit 1; }

passo "5/5 Build e subida (a 1ª vez leva alguns minutos)"
cd "$APP"
CALCULADORA_SRC="$CALC" CALCULADORA_VERSAO="$CALC_TAG" \
  $DOCKER compose -f infra/producao/docker-compose.yml --env-file "$ENV_FILE" up -d --build
$DOCKER compose -f infra/producao/docker-compose.yml ps
sleep 5
$DOCKER compose -f infra/producao/docker-compose.yml logs --tail 5 worker
echo
echo "Pronto. Logs ao vivo:  $DOCKER compose -f $APP/infra/producao/docker-compose.yml logs -f worker"
