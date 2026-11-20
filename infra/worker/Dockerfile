# Worker do ApuraRTC (Node 22). Contexto de build: raiz do monorepo.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Só os manifests primeiro (cache das dependências)
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace apps/worker --include-workspace-root=false --no-audit --no-fund

COPY packages/db packages/db
COPY apps/worker/tsconfig.json apps/worker/
COPY apps/worker/src apps/worker/src

USER node
WORKDIR /app/apps/worker
CMD ["npx", "--no-install", "tsx", "src/index.ts"]
