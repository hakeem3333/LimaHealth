FROM node:20-alpine

WORKDIR /app

# Full install: the server runs through tsx (a devDependency) instead of compiled JS
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
