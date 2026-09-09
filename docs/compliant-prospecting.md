# Compliant Prospecting Workflow

This repository can support prospecting for AgentReady without building a harvested personal-contact list.

Use `scripts/prospect-audit.ts` to audit companies where the website is a meaningful part of the product, booking flow, catalog, or lead-generation journey. The script writes a CSV with company context, AgentReady findings, public role-based inboxes, public phone numbers, contact-page URLs, and a tailored draft email.

The script deliberately filters out likely personal mailboxes and blocked mailboxes such as no-reply, abuse, postmaster, webmaster, privacy, and DPO addresses. Treat the resulting CSV as a starting point for legitimate interest review, suppression-list checks, jurisdiction-specific compliance review, and low-volume manual outreach.

## Target Segments

Good-fit segments:

- Hospitality, travel, ferry, rail, ticketing, and attractions where AI agents may soon compare availability, pricing, and booking options.
- Retail, wholesale, packaging, electronics, and B2B catalog companies where product pages are the product interface.
- Manufacturers and distributors where technical documentation, dealer routing, spare parts, and request-for-quote flows live on the website.
- Local or regional service marketplaces where an assistant needs to understand geography, opening hours, eligibility, and contact paths.

Useful qualification signals:

- Product, route, booking, catalog, or quote flows are primarily website-based.
- The site has weak structured data, unclear robots/crawler policy, missing sitemaps, or no AI-agent-facing access policy.
- Contact routing is hidden behind JavaScript-only widgets or ambiguous forms.
- The company sells across languages or borders, making machine-readable content more valuable.

## Run

Create a reviewable search plan from a keyword document:

```sh
npm run prospect-keywords -- --input data/prospect-keywords.csv --output data/prospect-search-plan.csv
```

Review those search-plan rows with a compliant search API, public directory, trade association list, or manual search. Add official company sites to `data/prospect-seeds.csv`.

Do not scrape Google result pages for email addresses. Search result pages are not the company source of truth, and bulk extraction of email addresses from result snippets creates a harvested contact list. Keep discovery focused on finding official company websites, then let the audit script collect only role-based public contact channels from those company-controlled pages.

Audit reviewed seed websites:

```sh
npm run prospects -- --input data/prospect-seeds.csv --output data/prospects.csv
```

For a short test:

```sh
npm run prospects -- --input data/prospect-seeds.csv --output data/prospects.sample.csv --limit 3
```

The starter seed list is intentionally small. Expand `data/prospect-seeds.csv` with companies from public directories, trade association member pages, conference exhibitor lists, marketplace category pages, or your own CRM exports. Keep the seed source in the `source` column so the output remains auditable.
