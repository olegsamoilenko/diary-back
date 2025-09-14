# ---------- build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# встановлюємо ВСІ залежності (включно з dev) для збірки
COPY package*.json ./
RUN npm ci

# копіюємо код і збираємо
COPY . .
RUN npm run build  # викликає "nest build" або "tsc" з package.json

# ---------- runtime stage ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# ставимо лише прод-залежності
COPY package*.json ./
RUN npm ci --omit=dev

# копіюємо зібраний код
COPY --from=builder /app/dist ./dist

# якщо треба інші артефакти (напр. prisma/schema), додай COPY тут

# запуск
CMD ["node", "dist/main.js"]
# (або залиш свій: CMD ["npm", "run", "start:prod"])