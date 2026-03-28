FROM ghcr.io/openclaw/openclaw:main-slim

# Copy agent configuration
COPY config/ /home/node/.openclaw/

EXPOSE 18789 18790

CMD ["node", "dist/index.js", "gateway", "--bind", "lan", "--port", "18789"]
