# One-shot ServBay SQL import for Railway Postgres (internal network).
# Deploy as a temporary Railway service linked to Account_Core Postgres.
FROM postgres:18-alpine

WORKDIR /import
COPY comptabilite_db_servbay.sql /import/dump.sql
COPY import.sh /import/import.sh
RUN chmod +x /import/import.sh

CMD ["/import/import.sh"]
