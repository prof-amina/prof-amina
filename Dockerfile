FROM node:22-alpine
WORKDIR /app
COPY server.js package.json ./
COPY public ./public
# Dossier de la mémoire d'Amina : à monter en "Persistent Storage" dans Coolify (destination /app/data)
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server.js"]
