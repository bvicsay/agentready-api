# AgentReady API

A customer API secured by Clerk API keys. It scans public websites with the
scanner in `packages/scanner` and returns machine-readable readiness findings.

## Endpoint

`POST /api/scan`

```sh
curl -X POST https://api.example.com/api/scan \
  -H 'Authorization: Bearer YOUR_CLERK_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","profile":"auto"}'
```

The complete request and response contract is in [`openapi.json`](openapi.json).

Free accounts are limited to 60 scans per hour by default. Successful responses
include `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`.
At the limit, the API returns `429 rate_limit_exceeded` with a `Retry-After`
header and directs customers to `barnabas@adaptmypage.com` for a higher limit.
Set `API_RATE_LIMIT`, `API_RATE_LIMIT_WINDOW_MS`, and `SUPPORT_EMAIL` to
override these deployment defaults.

## AgentReady source

The scanner is part of this repository. Its core, rules, report, types, and CLI
packages live under `packages/scanner`; the API calls that source directly. A
normal clone contains everything needed to build both the scanner and the API:

```sh
git clone git@github.com:bvicsay/agentready-api.git
cd agentready-api
npm ci
npm run build
```

`src/scan-service.ts` imports `packages/scanner/core` and
`packages/scanner/rules` directly. Docker builds those workspaces before
starting the API, so there is no generated engine bundle, separate checkout, or
submodule on the VPS.

## Local run

```sh
npm ci
npm start
curl http://localhost:3000/healthz
```

Run `clerk env pull` once to create the ignored `.env.local` file with the
development Clerk keys. `npm start` loads that file automatically.

Create a Clerk application, enable **User API keys** in the Clerk Dashboard,
then set the backend secret key:

```dotenv
CLERK_SECRET_KEY=sk_test_replace-with-your-clerk-secret-key
```

Keep this secret server-side and keep `.env.local` out of Git. Customer keys
are created and revoked in Clerk and are verified on every API request. See
[`docs/account-management.md`](docs/account-management.md) for the dashboard
and external-website setup.

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

Run that immutable image on an Ubuntu/Docker VPS with `CLERK_SECRET_KEY` supplied
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
npm run scanner:typecheck
npm audit
```

The application and scanner code are strict TypeScript.

## Upstream credit

This project uses [AgentReady](https://github.com/swarmclawai/agentready),
embedded from commit `70c516a7b3a8df261ddc6a3d1d78d646a1d7c37b`. Its original
README is preserved in `AGENTREADY-README.md`, and its Apache-2.0 license is
preserved in `AGENTREADY-LICENSE`. `LICENSE` covers this repository's original
API code.
