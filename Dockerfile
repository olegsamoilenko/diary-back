# Dockerfile
FROM node:20-alpine

RUN apt-get update && apt-get install -y apt-utils

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN npm run build

CMD ["npm", "run", "start:prod"]