# Vivarium game server — container image.
# Zero runtime dependencies (Node built-ins only), so there is no `npm install`
# step: just copy the deterministic core + the game and run the HTTP server.
# Works on any host that runs a container (Fly.io, Render, Railway, Cloud Run,
# a plain VPS). The server reads $PORT (most PaaS inject it) and falls back to 8787.
FROM node:22-alpine

WORKDIR /app

# The DOM-free core, the game/server, and the tests (so `docker run ... node
# test/server-smoke.js` can self-verify the image).
COPY src ./src
COPY game ./game
COPY test ./test

# Listens on $PORT (platform-injected on Render/Fly/Cloud Run) and falls back to
# 8787 for a local `docker run`; see game/server.js. No ENV PORT here, so the
# host's injected PORT is never masked.
EXPOSE 8787

# Drop root for a public-facing process.
USER node

CMD ["node", "game/server.js"]
