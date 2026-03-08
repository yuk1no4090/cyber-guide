FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# public may be empty; ensure dir exists then copy if present
RUN mkdir -p ./public
COPY --from=build /app/public* ./public/
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
