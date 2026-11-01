FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
ENV PYTHON=/opt/venv/bin/python HOST=0.0.0.0 PORT=3000
COPY --chown=node:node . .
RUN mkdir -p downloads && chown node:node downloads
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
