FROM node:20-bookworm-slim

# Install Python 3, pip, venv, and curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set up Python virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install backend npm dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Install frontend python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy full application code
COPY backend ./backend
COPY frontend ./frontend
COPY docs ./docs
COPY start.sh ./start.sh

RUN chmod +x ./start.sh

ENV PORT=8700
ENV BACKEND_PORT=4700
ENV API_BASE_URL="http://127.0.0.1:4700/api"
ENV UI_HOST="0.0.0.0"

EXPOSE 8700 4700

CMD ["sh", "start.sh"]
