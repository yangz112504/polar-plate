# Use Playwright base image with browsers preinstalled
FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app

# Install deps
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/ .

ENV NODE_ENV=production

# Bind to Render's PORT
CMD ["node", "src/server.js"]
