# 1) deps
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

# 2) build
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ .
RUN npm run build

# 3) run (lean)
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Only what we need to run "next start"
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# Install production deps only
RUN npm ci --omit=dev

# Render provides PORT; bind to 0.0.0.0 and that port
ENV HOST=0.0.0.0
CMD ["sh", "-c", "npx next start -p $PORT"]
