# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Nginx serving ───────────────────────────────────────────────────
FROM nginx:alpine AS runtime

RUN apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
