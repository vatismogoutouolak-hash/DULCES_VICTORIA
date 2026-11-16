FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY index.html style.css app.js backend.js ./
COPY scripts/build.mjs ./scripts/build.mjs
RUN node scripts/build.mjs

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 VIDEO_STORAGE=local VIDEO_ROOT=/srv/videos
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node package.json vercel.json ./
COPY --chown=node:node api ./api
COPY --chown=node:node server ./server
USER node
EXPOSE 3000
CMD ["node","server/hostinger.mjs"]
