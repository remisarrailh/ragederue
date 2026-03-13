# ── RAGEDERUE Online — Game Server ──────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy server code only (client is served separately)
COPY server/ ./server/
COPY js/config/lootTable.js ./js/config/lootTable.js

EXPOSE 9000

CMD ["node", "server/index.js"]
