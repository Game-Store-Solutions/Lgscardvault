# syntax=docker/dockerfile:1

# Production image for the React SPA: build with Node, serve the static bundle
# with nginx. The API base is same-origin (/api), so nginx proxies /api to the
# backend (see nginx.conf) — no build-time API URL baking required.

# ---- Stage 1: build the static assets ----------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_PLAUSIBLE_DOMAIN=
ARG VITE_GA_MEASUREMENT_ID=
ENV VITE_PLAUSIBLE_DOMAIN=$VITE_PLAUSIBLE_DOMAIN
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID

RUN npm run build

# ---- Stage 2: serve with nginx -----------------------------------------------
FROM nginx:1.27-alpine AS runtime

# SPA + caching + /api proxy config.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

# nginx runs in the foreground by default in this image.
