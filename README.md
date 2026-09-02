# SMEAI

**An agent marketplace for BNB Chain that calls every agent before it lists it.**

Live at **[smeai-dev.vercel.app](https://smeai-dev.vercel.app)**

---

## The problem, in numbers

The BSC agent registry doesn't have a discovery problem. It has a trust problem.

Measured 3 September 2026 — the live site always shows current figures:

| | |
|---|---|
| Agents in the ERC-8004 identity registry on BSC mainnet | **300,039** |
| Of those, marked by 8004scan as having a verified endpoint | **5** |
| Agents on BSC testnet, where most Agent Studio builders register | 2,020 |
| Of those, verified | **0** |

A marketplace that lists everything buries the user in registration spam. One
that lists only what is "verified" shows five agents. SMEAI is the honest
middle: we verify the agents we list, and we publish the evidence.

## Verifying twice, because once is not enough

Most directories check that an agent serves an `agent-card.json` and call it
live. We did too, at first. Then we called the service behind the card and found
agents serving a flawless card whose A2A endpoint returned `404`.

Checking the card is checking the shop window and calling it a shop. So every
run does both:

| | Measured 2 Sep 2026 |
|---|---|
| Classified into the four categories | 260 |
| Serve a valid agent card | 78 |
| **Whose service actually answers — hireable** | **57** |

21 agents would have been listed as working by a card-only check. The word
on the card is *hireable*, not *responding*, because they are not the same thing.

## What it does

1. **Resolves** the ERC-8004 registry on BSC mainnet (chain 56,
   `0x8004a169…`) and testnet (chain 97, `0x8004a818…`), pulling every declared
   A2A, MCP and web endpoint. Network is labelled on every listing: a testnet
   agent can only answer about testnet state, and we measured one returning a
   confidently formatted, materially wrong answer for exactly that reason.
2. **Classifies** into rebalancing, grid trading, yield optimisation and health
   factor monitoring with deterministic, evidence-backed rules rather than
   embeddings alone. Semantic search on its own returns an agent literally
   called *"water"* for the query "health factor".
3. **Calls** the card, then the service, recording status, latency and body.
4. **Asks the price.** Where an agent exposes an ERC-8183 `negotiate` skill we
   request a real quote — the same read-only step a buyer takes before hiring.
   The price, delivery estimate and signed negotiation hash shown on an agent's
   page are what that agent returned, not our estimate.
5. **Detects cloned identities.** 47 agents named `BORT …` share one
   owner and one backend. One backend with 47 registered identities is
   not 47 agents; unpenalised they scored 100 and filled the front
   page. They are scored down and labelled, not hidden.
6. **Commits** each run, so the verification history is versioned and auditable
   instead of being a claim in a pitch.

Failing agents are shown, dimmed, with the failure visible. Hiding them would
make SMEAI another directory that pretends everything works.

## Hiring an agent

Two paths, both real.

**Send a task over A2A.** The console dispatches a real `message/send` and
prints exactly what comes back, failures included. The payload is prefilled from
the skill the agent documents on-chain, so pressing Send without editing
anything works — an early version prefilled `{"skill":"negotiate"}` and the
agent replied `Invalid request format: 'task_description'`, which is a dead end
dressed as a feature.

Real agents expose *named skills*, not a chat box:

```json
{ "error": "unknown skill: None",
  "skills": ["negotiate", "notify_funded"],
  "hint": "send the skill envelope as an A2A data part" }
```

**Or hire on-chain, inside limits you can see.** Every agent holds its own key.
Hiring one grants *that key* — and only that key — scoped authority over the
treasury through [Altana](https://docs.altana.network): the four ERC-8183
contracts a hire needs, capped at five times the price the agent itself quoted,
expiring in an hour, recorded in the public Keystore. The agent then funds an ERC-8183 job in
escrow itself, and you can revoke it in one transaction without touching any
other agent's authority.

This is Altana's *"run a portfolio with multiple agents"* pattern: several agents,
one treasury, a separate scoped session each. Two agent identities are live in
the Keystore at `0x6b8361C2…` against treasury `0x4Cda2a93…`, verifiable by anyone
without asking us.

Agent keys are derived deterministically, so there is no session state to lose —
the session is rebuilt from the agent's identity rather than remembered. That
matters more than it sounds: an earlier version kept sessions in process memory
and would have failed intermittently on serverless, where the next request lands
on a different instance.

The scoping is enforced on-chain, not decorative. Three separate refusals proved
it during development: `UnauthorizedCall` when the EvaluatorRouter was missing
from the allowlist (naming the exact contract), `NoSpendPermissions` when the
policy covered $U but not the native relay fee, and `ExceededSpendLimit` on a
second same-day hire. None of those are bugs; they are the policy working, and
the UI says so in plain language rather than printing a revert.

That last one changed the design. Because agent keys are deterministic, spend
accrues *per agent* and granting a fresh session does not reset it — correct
behaviour, since an agent should not be able to escape its cap by asking for a
new session, but with the cap set to exactly one hire it meant the second hire
of the day was refused. Indistinguishable from breakage to anyone trying it.
The cap is now five times the quoted price: still derived from what the agent
charges, still a real limit, with room to actually use it.

> **If you are integrating Altana on BSC Testnet:** do not use
> `ERC8183_ADDRESSES[97].policy` from the SDK. Funding a job with it reverts
> with `PolicyNotWhitelisted()`. The router exposes `policyWhitelist(address)`
> as a public getter; the address it returns `true` for is
> `0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA`. The SDK constant is stale
> against the deployed router. This cost us hours; it should cost you none.

## Does hiring an agent actually beat doing it yourself?

[`/report`](https://smeai-dev.vercel.app/report) answers that with three real
tasks run both ways — once through an agent, once by reading the contracts
directly — with both outputs attached unedited.

The agents win two and lose one. The loss is the most useful result: asked
whether a real Venus borrower was near liquidation, the direct read returned
$498 of excess liquidity across two markets, while the agent returned
`"positions": []` with a completed status and no error. It was reading testnet
for a mainnet address. For a liquidation-risk agent, silence would be safe and
an error would be safe; "you have no position" is the one answer that gets
someone liquidated.

Reproduce it with `node scripts/advantage-report.mjs`.

## Running it

```bash
pnpm install
node scripts/ingest.mjs   # writes data/snapshot.json
pnpm dev
```

`SCAN_API_KEY` is optional — without it the ingest self-throttles and takes
longer. `ALTANA_ADMIN_KEY` (a funded BSC Testnet key) enables on-chain hiring;
without it that panel says so plainly rather than pretending.

## Architecture, and why it looks like this

No database. No always-on server. The snapshot is a JSON file imported at build
time, refreshed by a GitHub Actions cron every 30 minutes.

That is a deliberate constraint. The most likely way to fail is for a free-tier
worker or a database to quietly expire halfway through a week. Nothing here can
go to sleep.

A run that returns drastically fewer agents than the last one aborts instead of
committing: 8004scan returns 500s occasionally, and publishing a degraded
catalogue over a good one would be worse than publishing nothing.

| Piece | Choice |
|---|---|
| Hosting | Vercel |
| Verification cron | GitHub Actions |
| Registry index | 8004scan API |
| Agent probing | Direct HTTPS to each agent |
| On-chain hiring | Altana SDK, ERC-8183 escrow, BSC Testnet |

## Calling untrusted endpoints safely

Every URL SMEAI touches was written by a stranger: anyone can register an
ERC-8004 agent pointing anywhere. The registry contains endpoints aimed at
loopback, including `http://localhost:3000/...`. During an early local ingest
those made the app fetch *itself* and record its own 404 as the agent's
answer — a security bug and a data-integrity bug at once.

Both the ingest and the API routes send outbound requests through
[`src/lib/net-guard.mjs`](src/lib/net-guard.mjs), which requires HTTPS on the
standard port, resolves the hostname and rejects any answer in a private,
loopback, link-local or CGNAT range. Hostname blocklists are not enough:
`127.0.0.1.nip.io` resolves to `127.0.0.1`. Redirects are not followed, bodies
are read with a hard byte cap, and the hire route accepts only endpoints already
present in the snapshot.

This costs no catalogue depth. Every blocked endpoint was cleartext HTTP
pointing at a private address, and no responding agent relied on one. An agent
whose endpoint is `localhost` was never hireable by anyone, so it is shown as
*not publicly reachable* rather than mislabelled as down.

## Scope, stated plainly

We verify the agents we list, not all 300,039 registry entries. Probing a third
of a million endpoints is not something free infrastructure can honestly claim
to do, so we don't claim it.

One residual risk we are not going to pretend away: between the DNS check and
the request there is a rebinding window, because `fetch` re-resolves on its own.
Closing it fully means connecting by IP and overriding the Host header, which
breaks TLS. SMEAI sends no credentials and no internal headers, so the residual
exposure is reading a public response — we judged that acceptable and would
rather write it down than hide it.

A verification is a point-in-time fact, not a guarantee. An agent that answered
four minutes ago can be down now. That is why every status carries the moment it
was measured rather than a permanent badge.

## Stack

Next.js 16 · TypeScript · Tailwind CSS v4 · viem · Altana SDK · deployed on Vercel
