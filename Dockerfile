FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3020

COPY package*.json ./
RUN npm install --omit=dev

COPY dist ./dist
COPY api ./api
COPY shared ./shared
COPY server.js ./server.js

EXPOSE 3020

CMD ["node", "server.js"]
