#!/bin/sh
set -e

PORT="${PORT:-80}"
API_UPSTREAM="${API_UPSTREAM:-https://zaizens-account.up.railway.app}"
API_HOST="${API_HOST:-$(echo "$API_UPSTREAM" | sed -E 's~https?://~~; s~/.*~~; s~:.*~~')}"

export PORT API_UPSTREAM API_HOST

envsubst '${PORT} ${API_UPSTREAM} ${API_HOST}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

echo "nginx: listening on ${PORT}, API upstream ${API_UPSTREAM}"

exec nginx -g 'daemon off;'
