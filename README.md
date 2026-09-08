# AgentReady API

Public REST API for passive website agent-readiness scans. It returns the pinned upstream AgentReady score, findings, evidence and recommendations as JSON.

This repository deploys independently from the Adapt My Page website. It does not execute JavaScript, submit forms or log in to sites. It is an alpha diagnostic, not proof of successful agent actions.

## Endpoints

- `POST /api/v1/scan` — authenticated scan (`Authorization: Bearer amp_…`)
- `POST /api/scan` — same-origin demo scan with a small anonymous limit
- `POST /api/account` — passwordless email login and verification
- `GET /api/account` — current verified account
- `POST /api/keys` — create, list or revoke account keys
- `POST /api/lead` — transactional report delivery
- `GET /healthz` — process health

OpenAPI is available in [`openapi.json`](openapi.json).

## Run locally

```sh
cp .env.example .env
npm ci
npm start
curl http://localhost:3000/healthz
```

Required production variables are `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` and `RESEND_FROM`. Keep them in a secret manager or an untracked environment file. Run [`supabase/migrations/202609080001_public_api.sql`](supabase/migrations/202609080001_public_api.sql) once in the intended Supabase project.

## Docker

```sh
docker build -t agentready-api .
docker run --rm --env-file .env -p 3000:3000 agentready-api
```

Put TLS termination, rate limiting and a firewall in front of the container. Keep port 3000 private.

## VPS deployment

Build and publish the image from GitHub Actions or a registry, then run it on an Ubuntu/Docker host:

```sh
docker pull ghcr.io/bvicsay/agentready-api:sha-COMMIT_SHA
docker run -d --name agentready-api --restart unless-stopped --env-file .env \
  -p 127.0.0.1:3000:3000 ghcr.io/bvicsay/agentready-api:sha-COMMIT_SHA
```

Put Caddy, Nginx or a managed load balancer in front for HTTPS. Use immutable image tags and keep Supabase and Resend secrets only on the host.

## Limits and safety

The API enforces account quotas, shared capacity limits, concurrent-scan limits, request-size bounds, timeouts, robots rules and public-network-only URL validation. It blocks private IPs, credentials, unsafe protocols and cross-site follow-up requests. Do not expose Supabase service-role keys or API key plaintext.

## Development

```sh
npm test
npm audit
```

The scanner engine is pinned from [swarmclawai/agentready](https://github.com/swarmclawai/agentready). Review upstream changes before updating it. The upstream license is included in `AGENTREADY-LICENSE`.
