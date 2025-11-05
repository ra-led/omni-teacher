FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install || npm install --legacy-peer-deps
COPY . .
EXPOSE 4173
CMD ["npm", "run", "dev"]
