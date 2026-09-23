FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY apps ./apps
COPY packages ./packages
COPY test ./test
COPY installer ./installer
COPY scripts ./scripts
RUN npm run build
RUN npm install --global @openai/codex@0.154.0 && apt-get update && apt-get install -y --no-install-recommends git ripgrep ca-certificates && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /work /codex && chown node:node /work /codex
USER node
EXPOSE 3080
CMD ["node", "dist/server.js"]
