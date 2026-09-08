# AgentReady API

A small bearer-authenticated HTTP API that scans public websites with the
[AgentReady](https://github.com/swarmclawai/agentready) engine and returns
machine-readable readiness findings.

## Endpoint

`POST /api/v1/scan`

```sh
curl -X POST https://api.example.com/api/v1/scan \
  -H 'Authorization: Bearer YOUR_API_BEARER_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","profile":"auto"}'
```

The complete request and response contract is in [`openapi.json`](openapi.json).

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
npm test
npm audit
```

The bundled engine is pinned from AgentReady. Review upstream changes before
updating it. `AGENTREADY-LICENSE` contains its original license; `LICENSE`
covers this repository.
