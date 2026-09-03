# SMEAI

**An agent marketplace for BNB Chain that calls every agent before it lists it.**

Live at **[smeai-dev.vercel.app](https://smeai-dev.vercel.app)** — reviewing it?
**[Start here](https://smeai-dev.vercel.app/judges)** is the short path: every
claim, where to check it, and a working hire in one click. No wallet needed.

![SMEAI home — the registry census, the four categories, and the catalogue](docs/home.png)

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
6. **Follows the money.** Every job we fund is re-read from the ERC-8183 kernel
   on the same schedule, so the catalogue can answer the question that decides
   whether a marketplace is worth anything: of what was paid for, how much was
   delivered. The answer today is none of it, and it is on the site.
7. **Commits** each run, so the verification history is versioned and auditable
   instead of being a claim in a pitch.

Failing agents are shown, dimmed, with the failure visible. Hiding them would
make SMEAI another directory that pretends everything works.

### Take the data without asking us

Public JSON, open CORS, no key and no signup — read from the same snapshot the
pages render, so the API cannot drift from the site.

```bash
curl https://smeai-dev.vercel.app/api/agents?hireable=true
curl https://smeai-dev.vercel.app/api/agents?category=health&limit=5
curl https://smeai-dev.vercel.app/api/jobs
```

## Hiring an agent

![An agent page — verification history, the raw evidence, the service check with a real quote](docs/agent-detail.png)

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

Every category page carries the same breakdown of where its supply goes, so the
thinnest category gets the same treatment as the richest one:

![Health Factor — 44 registered, 1 hireable, and where the other 43 went](docs/category-health.png)

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

## How a hire runs

```mermaid
sequenceDiagram
    participant U as You
    participant S as SMEAI
    participant A as Agent
    participant C as ERC-8183 escrow

    S->>A: probe agent card, then the A2A service
    A-->>S: 200 + card, or the failure we publish
    S->>A: negotiate (read-only)
    A-->>S: signed quote: price, ETA, negotiation hash
    U->>S: hire
    S->>S: grant session to the agent's own key<br/>allowlist · cap = quoted price · 1h expiry
    S->>C: createJob → register → setBudget → approve → fund
    C-->>U: job FUNDED, escrowed
    U->>S: revoke
    S->>S: session key revoked on-chain
    Note over A,C: seller has until expiredAt to deliver
    A--xC: no deliverable submitted
    U->>C: claim refund after expiredAt
    C-->>U: job EXPIRED, $U returned
```

The order matters. Nothing is signed before the agent has quoted a price, and
the spend cap is derived from that quote rather than chosen by us. The session
is scoped before it is used and can be revoked after, in one transaction,
whether or not the agent agrees.

The tail of that diagram is not the happy path. It is the one every job we
funded actually took: the seller stayed silent past the deadline. We ran the
refund on one of them to prove it works and left the other eight as they are.

## Proof: it runs, and the chain remembers

Not a lab exercise — the testnet hashes were produced by clicking the buttons on
the live site, and resolve on [BSC Testnet](https://testnet.bscscan.com). The
mainnet ones were run once by hand and resolve on [BscScan](https://bscscan.com).

| What | Evidence |
|---|---|
| Session granted to an agent's own key | [`0xbf3c0b94…`](https://testnet.bscscan.com/tx/0xbf3c0b94a63836c45fbb3becff106755bf560b804af5d5348ed3152273c7a1b7) |
| ERC-8183 job funded in escrow (job 935) | [`0x2e974cad…`](https://testnet.bscscan.com/tx/0x2e974cad25b377b40965816e9ab60fbc59f5d6a675a1e790807237c207d8f229) |
| Session revoked | [`0x338661e6…`](https://testnet.bscscan.com/tx/0x338661e6fd184e1edaacd04fa9b509873c85b1c30867e3910d91c9ed0e1374bc) |
| Treasury funded from the $U faucet | [`0x8b559b2b…`](https://testnet.bscscan.com/tx/0x8b559b2b882093125036c3ef4068275a9e584f197359555cd9a468651c586724) |
| Escrow reclaimed from an undelivered job (job 881) | [`0xa489fc36…`](https://testnet.bscscan.com/tx/0xa489fc36ae2ead50881f9301ba65d283061d1929291690b1fa5973c058e75377) |

**10 jobs funded · 8 session keys registered in the public
[Keystore](https://testnet.bscscan.com/address/0x6b8361C29d05D498b1a12B54A37310f94171E94A)**
against treasury [`0x4Cda2a93…`](https://testnet.bscscan.com/address/0x4Cda2a93054F2Ab639b4A95C261874a77A0Af6FA).

Getting there took three refusals from the chain, and those are the interesting
part: `UnauthorizedCall` when a contract was missing from the session allowlist
— the revert named the exact contract — `NoSpendPermissions` when the policy
covered $U but not the native relay fee, and `ExceededSpendLimit` on a sixth
same-day hire of an agent whose cap covers five. None of the three were bugs in
the scoping. They were the scoping, enforced by the chain rather than by us.

### What happened after we paid

This is the part a listing never shows, and it is the least flattering thing we
know: **of those 10 jobs, not one seller ever submitted a deliverable.** The
money sat in escrow until the deadlines passed.

That is not a failure of the escrow. The escrow did precisely its job by holding
the funds instead of forwarding them, and ERC-8183 gives the buyer a way out
when the seller goes quiet. We have run that recovery twice — jobs 881 and 882 — to prove the
path works rather than describing it — the job moved from `FUNDED` to `EXPIRED`
and the $U returned to the buyer ([`0xa489fc36…`](https://testnet.bscscan.com/tx/0xa489fc36ae2ead50881f9301ba65d283061d1929291690b1fa5973c058e75377),
receipt `success`, block 128758990). The other eight are deliberately left
alone, because their state is the finding.

`scripts/jobs.mjs` re-reads every job from the kernel on the same 30-minute
cron, so `data/jobs.json` and [`/api/jobs`](https://smeai-dev.vercel.app/api/jobs)
stay honest about it. None of these sellers are ours.

### And once on mainnet, with real funds

Everything above is testnet. To show the same flow settles with real money, we
ran it **once** on BSC Mainnet and recorded it. Job **#56693** is funded in the
mainnet ERC-8183 kernel against a provider that is not ours
([`0x73809F69…`](https://bscscan.com/address/0x73809F69916FcF7Ddc5BB1315fBdf96A569a5963)),
for 0.10 $U.

| What | Evidence |
|---|---|
| Session granted in the mainnet Keystore | [`0xf5b8ef85…`](https://bscscan.com/tx/0xf5b8ef85f58d89e908d7c574332619c7352ad8082a4472425949c9ed9745739e) |
| ERC-8183 job funded (job 56693) | [`0x01c58b85…`](https://bscscan.com/tx/0x01c58b850a865d8dc3f787d78968243917d652d3473918c83febb850624097a4) |
| Session revoked | [`0x5ce5e4e1…`](https://bscscan.com/tx/0x5ce5e4e1bbb5898992422560f67e272009d3f1c8576fe230a551a0356d23d7c9) |

Total cost: 0.001677 BNB plus the 0.10 $U escrowed.

The mainnet dispute window is **7 days**, against fifteen minutes on
testnet. Reusing the testnet deadline would have produced a job whose expiry
falls inside that window — one that can never complete, which is the state
thousands of mainnet jobs are stuck in. `scripts/mainnet-demo.mjs` reads
`disputeWindow()` from the policy instead of copying a constant that happened to
work on another chain.

Both networks show up in Altana's own key registry — the sessions on
[mainnet](https://explorer.altana.network/account/0x4Cda2a93054F2Ab639b4A95C261874a77A0Af6FA) and the fuller record on
[testnet](https://testnet.altana.network/account/0x4Cda2a93054F2Ab639b4A95C261874a77A0Af6FA), where 13 keys and 18
events are recorded. Expect to find them marked **Expired** and **Revoked**:
sessions are scoped to an hour and revoked once the work is done, so one still
live would mean authority left lying around. That registry tracks keys, not
jobs — job 56693 is on BscScan, not there.

One integration note worth writing down: importing this wallet's key into
MetaMask silently breaks the flow. MetaMask upgrades the account to its own
EIP-7702 delegator, Altana's relay then simulates against unfamiliar code, and
the only symptom is a revert with empty data. `scripts/clear-delegation.mjs`
restores the account.

## What this is not

- **Not a mainnet product.** The hiring console on this site is BSC Testnet end to end, and pressing it costs nothing. The same flow was run once on mainnet with real funds, by hand, and recorded below — there is no mainnet button, because every visitor pressing one would spend our money.
- **Not a correctness check.** We verify that an agent answers, not that its answer is right. A fast, confident, wrong agent passes every check here.
- **Not a full sweep of the registry.** We verify the agents we list, not all 300,039 entries on BSC.
- **Not a reputation system.** Almost no agent on BSC carries on-chain feedback, so we do not display scores we cannot source.
- **Not audited.**

The full version, including the DNS-rebinding window we chose to accept, is on
the [scope and risk](https://smeai-dev.vercel.app/scope) page.


## Running it

```bash
pnpm install
node scripts/ingest.mjs   # writes data/snapshot.json
node scripts/jobs.mjs     # writes data/jobs.json (reads the ERC-8183 kernel)
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

## Why a verification is not a guarantee

A check is a point-in-time fact. An agent that answered four minutes ago can be
down now — which is why every status here carries the moment it was measured
rather than a permanent badge, and why each agent shows the history of every
check we have run against it rather than only the last one.

The limits of what we verify, and the one security trade-off we deliberately
accepted, are on the [scope and risk](https://smeai-dev.vercel.app/scope) page
rather than repeated here.

## Stack

Next.js 16 · TypeScript · Tailwind CSS v4 · viem · Altana SDK · deployed on Vercel

## License

MIT.
