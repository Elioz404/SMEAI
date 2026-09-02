# SMEAI

**An agent marketplace for BNB Chain that calls every agent before it lists it.**

Built for [The Smart Money Era: Build the Era](https://www.bnbchain.org/en/hackathons/smart-money-era).

---

## The problem, in numbers

The BSC agent registry doesn't have a discovery problem. It has a trust problem.

| | |
|---|---|
| Agents in the ERC-8004 identity registry on BSC mainnet | **297,281** |
| Of those, marked by 8004scan as having a verified endpoint | **5** |
| Agents on BSC testnet, where most Agent Studio builders register | 2,016 |
| Of those, verified | **0** |

A marketplace that lists everything buries the user in registration spam. A
marketplace that lists only what is "verified" shows five agents. SMEAI is the
honest middle: we verify the agents we list, and we show the evidence.

## What it does

1. **Resolves** the ERC-8004 registry on both BSC mainnet (chain 56, registry
   `0x8004a169…`) and testnet (chain 97, registry `0x8004a818…`), pulling every
   agent's declared A2A, MCP and web endpoints.
2. **Classifies** them into the four hackathon categories — rebalancing, grid
   trading, yield optimisation, health factor monitoring — with deterministic,
   evidence-backed rules rather than embeddings alone. Semantic search on its own
   returns an agent literally called *"water"* for the query "health factor"; that
   agent has no business appearing in a lending product.
3. **Calls** every declared endpoint for real and records the status code, the
   latency and the response body. An agent counts as *responding* only if it
   returns a parseable agent card.
4. **Commits** each run to this repository, so the verification history is
   versioned and auditable instead of being a claim in a pitch deck.

Agents that fail are shown, dimmed, with the failure visible — not hidden.
Hiding them would make SMEAI another directory that pretends everything works.

## Hiring an agent

The "Hire" console dispatches a real A2A `message/send` task to the agent and
prints exactly what comes back, failures included.

This turned out to matter. Sending free text to a live rebalancing agent returns:

```json
{ "error": "unknown skill: None",
  "skills": ["negotiate", "notify_funded"],
  "hint": "send the skill envelope as an A2A data part" }
```

Real agents expose *named skills*, not a chat box. So SMEAI reads the skills out
of each agent's card and offers them as the actual unit of hiring.

## Running it

```bash
pnpm install
node scripts/ingest.mjs   # writes data/snapshot.json
pnpm dev
```

`SCAN_API_KEY` is optional. Without it the ingest self-throttles to 30 req/min
and takes a few minutes; there is no paid dependency anywhere in this project.

## Architecture, and why it looks like this

No database. No always-on server. The snapshot is a JSON file imported at build
time, refreshed by a GitHub Actions cron every 30 minutes.

That is a deliberate constraint, not a shortcut. Judging runs from 9 to 23
September, and the most likely way to lose is for a free-tier worker or a
database to quietly expire halfway through. Nothing here can go to sleep.

| Piece | Choice | Cost |
|---|---|---|
| Hosting | Vercel | $0 |
| Verification cron | GitHub Actions | $0 |
| Registry index | 8004scan API (works unauthenticated) | $0 |
| Agent probing | Direct HTTPS to each agent | $0 |

## Calling untrusted endpoints safely

Every URL SMEAI touches was written by a stranger: anyone can register an
ERC-8004 agent pointing anywhere. The registry currently contains 24 endpoints
aimed at loopback, including `http://localhost:3000/...`. During an early local
ingest run those made the app fetch *itself* and record its own 404 as if it were
the agent's answer — a security bug and a data-integrity bug at once.

So both the ingest and `/api/hire` route every outbound request through
[`src/lib/net-guard.mjs`](src/lib/net-guard.mjs), which requires HTTPS on the
standard port, resolves the hostname and rejects any answer in a private,
loopback, link-local or CGNAT range. Hostname blocklists are not enough:
`127.0.0.1.nip.io` resolves to `127.0.0.1`. Redirects are not followed, response
bodies are read with a hard byte cap, and `/api/hire` additionally accepts only
endpoints already present in the snapshot.

None of this costs us catalogue depth: every blocked endpoint was cleartext HTTP
pointing at a private address, and zero currently-responding agents relied on one.
An agent whose endpoint is `localhost` was never hireable by anyone anyway, so it
is shown as *not publicly reachable* rather than mislabelled as down.

## Scope, stated plainly

We verify the agents we list, not all 297,281 registry entries. Probing a third
of a million endpoints is not something free infrastructure can honestly claim to
do, so we don't claim it.

One residual risk we are not going to pretend away: between the DNS check and the
actual request there is a rebinding window, because `fetch` re-resolves on its
own. Closing it fully means connecting by IP and overriding the Host header,
which breaks TLS. SMEAI sends no credentials and no internal headers, so the
residual exposure is reading a public response — we judged that acceptable and
would rather write it down than hide it.

## Stack

Next.js 16 · TypeScript · Tailwind CSS v4 · deployed on Vercel

Three runtime dependencies: `next`, `react`, `react-dom`. Nothing else, on
purpose — every extra package is supply-chain surface for a project whose whole
claim is trustworthiness.
