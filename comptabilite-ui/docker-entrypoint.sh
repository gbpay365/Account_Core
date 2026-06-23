#!/bin/sh
set -e

PORT="${PORT:-80}"
API_UPSTREAM="${API_UPSTREAM:-https://zaizens-account.up.railway.app}"
API_HOST="$(printf '%s' "$API_UPSTREAM" | sed -E 's#^https?://##; s#/.*##')"

sed -i "s/listen 80;/listen ${PORT};/" /etc/nginx/conf.d/default.conf
sed -i "s|__API_UPSTREAM__|${API_UPSTREAM}|g" /etc/nginx/conf.d/default.conf
sed -i "s|__API_HOST__|${API_HOST}|g" /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
