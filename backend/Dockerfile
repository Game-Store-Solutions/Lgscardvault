# syntax=docker/dockerfile:1

# Production image for the Symfony backend.
#
# Secrets are NEVER baked in: APP_SECRET, JWT_PASSPHRASE, DATABASE_URL, etc.
# are injected as environment variables at runtime (see README → Production
# configuration). The committed .env holds dev-only defaults; APP_ENV=prod
# here makes Symfony ignore .env.local-style dev overrides.

# ---- Stage 1: resolve PHP dependencies (no dev, optimized autoloader) --------
FROM composer:2 AS vendor
WORKDIR /app

# Install deps against composer.json/lock only first, so this layer caches
# until the lockfile changes. Platform reqs (ext-sodium, pdo_pgsql, …) are
# satisfied by the runtime image, not the composer image, hence the ignore.
COPY composer.json composer.lock symfony.lock ./
RUN composer install \
        --no-dev \
        --no-scripts \
        --no-autoloader \
        --prefer-dist \
        --no-progress \
        --no-interaction \
        --ignore-platform-reqs

COPY . .
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative

# ---- Stage 2: runtime (FrankenPHP: production PHP app server in one binary) --
FROM dunglas/frankenphp:1-php8.4 AS runtime
WORKDIR /app

# curl is used by the container HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# PHP extensions the app needs in production.
RUN install-php-extensions \
        pdo_pgsql \
        intl \
        sodium \
        opcache \
        zip

# Production PHP + OPcache settings.
RUN { \
        echo 'opcache.enable=1'; \
        echo 'opcache.enable_cli=0'; \
        echo 'opcache.memory_consumption=256'; \
        echo 'opcache.max_accelerated_files=20000'; \
        echo 'opcache.validate_timestamps=0'; \
        echo 'realpath_cache_size=4096K'; \
        echo 'realpath_cache_ttl=600'; \
    } > "$PHP_INI_DIR/conf.d/app-opcache.ini" \
    && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# Upload limits sized for CSV imports. The app accepts up to 10 MB / 50k rows
# (StoreCsvImportController + CsvImportParser::MAX_ROWS); PHP's defaults
# (upload_max_filesize=2M, post_max_size=8M) would silently drop larger uploads
# before Symfony ever sees the file. memory_limit is raised so parsing a full
# 50k-row file into memory doesn't exhaust the default 128M.
RUN { \
        echo 'upload_max_filesize=12M'; \
        echo 'post_max_size=13M'; \
        echo 'memory_limit=512M'; \
    } > "$PHP_INI_DIR/conf.d/app-uploads.ini"

ENV APP_ENV=prod \
    APP_DEBUG=0 \
    # FrankenPHP serves the Symfony public/ dir.
    SERVER_NAME=:8000

COPY --from=vendor /app /app

# Warm the prod cache at build time and make var/ + uploads writable.
RUN mkdir -p var/cache var/log public/uploads \
    && php bin/console cache:clear --no-warmup --env=prod || true \
    && chown -R www-data:www-data var public/uploads

EXPOSE 8000

# Liveness probe (mirrors the k8s/LB probe path).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# FrankenPHP (Caddy) auto-detects public/index.php as the Symfony front controller.
CMD ["frankenphp", "php-server", "--listen", ":8000", "--root", "public/"]
