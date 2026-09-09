# Account management with Clerk

Clerk is the account system for this API. It owns sign-up, sign-in, password
recovery, social login, user profiles, organizations, subscriptions, and the
customer API-key lifecycle. This repository only validates customer keys and
uses the returned Clerk subject as the stable customer identity.

## 1. Configure Clerk

1. Create one Clerk application for Adapt My Page.
2. In **API keys**, enable **User API keys**. Enable organization keys as well
   only if customers need shared team credentials.
3. Configure the sign-in methods you want. Email verification and Google login
   are a simple default.
4. Add the website's production domain and local development URL to Clerk.
5. Copy the instance's publishable key to the website and its secret key to the
   API deployment.

Use separate Clerk development and production instances. Never put
`CLERK_SECRET_KEY` in browser code or in the website's public environment
variables.

## 2. Add the hosted account UI to the static website

The Adapt My Page static site links `/api-access` to Clerk's Account Portal.
Set `CLERK_ACCOUNT_PORTAL_URL` in the site's `.env.runtime` to the exact
portal URL from Clerk; the Nginx redirect sends people to `/sign-up`. Enable
User API keys in Clerk first. After sign-up, the portal's **Account → API
Keys** view lets them create, copy and revoke their key without exposing a
server credential.

The site and API deployments also share a separate `INTERNAL_SITE_TOKEN`. It
is only for the website's anonymous demo scanner on the private proxy path; it
is never accepted as a customer API key.

## 3. Embed the account UI in an application

For a React or Next.js website, install the matching Clerk SDK and wrap the app
in `ClerkProvider`. Clerk's existing profile UI is the shortest path: after API
keys are enabled in the Dashboard, `UserProfile` and `UserButton` automatically
show an **API Keys** tab where customers can create, copy, name, and revoke
their keys.

```tsx
import { ClerkProvider, SignInButton, UserButton } from "@clerk/nextjs";

export function AccountControls() {
  return (
    <>
      <SignInButton />
      <UserButton />
    </>
  );
}
```

If the site has a dedicated account page, render the full profile there:

```tsx
import { UserProfile } from "@clerk/nextjs";

export default function AccountPage() {
  return <UserProfile />;
}
```

Set the website variables using the values from the same Clerk instance:

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_replace-me
CLERK_SECRET_KEY=sk_test_replace-me
```

The website's secret key is needed only by its server-side Clerk integration.
The publishable key is intentionally safe for browser code.

## 4. Configure this API

Set the matching Clerk instance secret on the API host:

```dotenv
CLERK_SECRET_KEY=sk_test_replace-me
```

Each customer sends the key they created in their account:

```sh
curl -X POST https://api.example.com/api/scan \
  -H 'Authorization: Bearer ak_live_replace-me' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","profile":"auto"}'
```

The API verifies the key with Clerk on every request. Revoked, expired, and
unknown keys return `401`. A Clerk outage or missing server configuration
returns `503`, so clients can distinguish bad credentials from a temporary
authentication failure.

## 5. Turn on paid plans when needed

Clerk Billing can add pricing, checkout, subscriptions, invoices, and a billing
portal without introducing another customer system. Define plan features in
Clerk first, then enforce the relevant entitlement in the API before launching
paid tiers. API-key authentication identifies the customer; usage quotas still
need a durable counter keyed by the returned Clerk `subject`.

Do not expose a shared server credential to the website. The old
`API_BEARER_TOKEN` configuration has been removed; every customer now has an
individually revocable Clerk key.
