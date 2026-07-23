FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /data/sessions \
  && chown -R node:node /data \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV CONNECTOR_PORT=8080
ENV CONNECTOR_DATA_DIR=/data/sessions
EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]

