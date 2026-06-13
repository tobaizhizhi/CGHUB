# CGHub Settlement Frontend

This Next.js app is the CGHub settlement workspace for contribution rounds.

It is organized around real user workflows:

- Overview: round status, next action, funding and contribution progress.
- Contributions: submit work and review Agent scores.
- Payouts: review payout shares, finalize the round, and claim.
- Treasury: inspect funding, Cobo Agent Wallet status, balances, policies, and approvals.
- Activity: review settlement actions, chain transactions, and Cobo audit details.
- Replay: round history and full audit replay.

## Quick Start

```bash
cd cghub-mvp-hackathon/frontend-前端
npm install
npm run dev
```

Open `http://localhost:3000` for the workspace.

Useful routes:

- `/`
- `/contributions`
- `/payouts`
- `/treasury`
- `/activity`
- `/replay`

## Notes

- Frontend public config is limited to `NEXT_PUBLIC_*`.
- Cobo API keys, wallet UUIDs, pact credentials, and Agent private keys belong only in the Agent service environment.
- Start `agent/` with `npm run api` for signing, submission, claim, Cobo status, decisions, and audit APIs.
