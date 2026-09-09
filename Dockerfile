FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
# npm resolves workspace dependencies from their individual manifests. Copy
# them before `npm ci`; copying only the root manifest leaves rules-only
# packages such as yaml and zod out of the image.
COPY packages/scanner/types/package.json packages/scanner/types/package.json
COPY packages/scanner/core/package.json packages/scanner/core/package.json
COPY packages/scanner/rules/package.json packages/scanner/rules/package.json
COPY packages/scanner/report/package.json packages/scanner/report/package.json
COPY packages/scanner/cli/package.json packages/scanner/cli/package.json
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
