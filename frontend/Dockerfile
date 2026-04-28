FROM node:20-alpine AS build
WORKDIR /app
ARG INTERNAL_API_BASE_URL=http://localhost:8080
ARG NEXT_PUBLIC_API_BASE_URL=
ENV INTERNAL_API_BASE_URL=${INTERNAL_API_BASE_URL}
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
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
