# AgentReady API

A small bearer-authenticated HTTP API that scans public websites with the
[AgentReady](https://github.com/swarmclawai/agentready) engine and returns
machine-readable readiness findings.

## Endpoint

`POST /api/scan`

```sh
curl -X POST https://api.example.com/api/scan \
  -H 'Authorization: Bearer YOUR_API_BEARER_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","profile":"auto"}'
```

The complete request and response contract is in [`openapi.json`](openapi.json).

## AgentReady source

AgentReady is part of this repository. Its packages, source, tests, and docs
live directly in `packages/` and `docs/`; the API is an additional interface
over the same scanner code. A normal clone contains everything needed to build
both the scanner and the API:

```sh
git clone git@github.com:bvicsay/agentready-api.git
cd agentready-api
npm ci
npm run build
```

`src/agentready-entry.ts` is the single integration seam: it imports the local
`packages/core` scanner and `packages/rules` definitions.
`src/build-engine.mjs` bundles them into `src/agentready-engine.cjs`. Docker
runs the same build automatically, so no separate AgentReady checkout or
submodule is needed on the VPS.

## Local run

```sh
cp .env.example .env
npm ci
npm start
curl http://localhost:3000/healthz
```

Set one secret environment variable:

```dotenv
API_BEARER_TOKEN=replace-with-a-long-random-secret
```

Generate a strong value with `openssl rand -hex 32`. Keep `.env` out of Git.

## Docker

```sh
docker build -t agentready-api .
docker run --rm --env-file .env -p 3000:3000 agentready-api
```

For production, terminate HTTPS with Caddy, Nginx or a load balancer and keep
port 3000 private. The container exposes only `/healthz` and the scan endpoint.

## GitHub Actions and VPS

Pushing a `v*` tag runs the included workflow and publishes a multi-architecture
image to GitHub Container Registry:

```sh
git tag v0.1.0 && git push origin v0.1.0
docker pull ghcr.io/bvicsay/agentready-api:sha-COMMIT_SHA
```

Run that immutable image on an Ubuntu/Docker VPS with `API_BEARER_TOKEN` supplied
only by the host environment or a secret manager. Add firewall and request-rate
limits at the proxy before broad public use.

## Safety and limits

Scans are passive HTTP only: no JavaScript execution, form submission, login or
agent task execution. URLs must be public HTTP(S), use standard ports, contain
no credentials/query strings/fragments, and pass private-network and redirect
checks. Each scan is bounded by pages, requests, response size and time. Only
scan sites you are authorized to assess; the score is an alpha diagnostic, not a
security, SEO or AI-visibility guarantee.

## Development

```sh
npm run build
npm run typecheck
npm run agentready:typecheck
npm audit
```

The application code is strict TypeScript. The generated
`src/agentready-engine.cjs` file is the build artifact that bridges the pinned
AgentReady TypeScript source to the Node runtime; do not edit it by hand.

## Upstream credit

This project uses [AgentReady](https://github.com/swarmclawai/agentready),
embedded from commit `70c516a7b3a8df261ddc6a3d1d78d646a1d7c37b`. Its original
README is preserved in `AGENTREADY-README.md`, and its Apache-2.0 license is
preserved in `AGENTREADY-LICENSE`. `LICENSE` covers this repository's original
API code.
