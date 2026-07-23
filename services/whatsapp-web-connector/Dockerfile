FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN mkdir -p /data/sessions && chown -R node:node /data

ENV NODE_ENV=production
ENV CONNECTOR_PORT=8080
ENV CONNECTOR_DATA_DIR=/data/sessions
USER node
EXPOSE 8080

CMD ["npm", "start"]

