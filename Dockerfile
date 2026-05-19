FROM node:20-bookworm-slim

# better-sqlite3: нативная сборка, если нет подходящего prebuild
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Реальный порт задаёт Railway через $PORT; EXPOSE — подсказка для прокси (часто 8080).
EXPOSE 8080

CMD ["npm", "start"]
