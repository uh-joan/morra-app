# morra event collector — one file, no dependencies
FROM node:22-alpine
WORKDIR /app
COPY collector.mjs .
USER node
EXPOSE 9310
CMD ["node", "collector.mjs"]
