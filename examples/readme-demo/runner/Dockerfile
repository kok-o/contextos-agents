FROM node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b

ARG CODEX_VERSION=0.149.1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git ripgrep python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global --no-audit --no-fund @openai/codex@${CODEX_VERSION} \
    && mkdir -p /workspace /home/node/.codex /opt/demo \
    && chown -R node:node /workspace /home/node/.codex /opt/demo

COPY probe.mjs runtime-config.toml /opt/demo/
USER node
ENV HOME=/home/node
ENV CODEX_HOME=/home/node/.codex
WORKDIR /workspace
CMD ["node", "/opt/demo/probe.mjs"]
