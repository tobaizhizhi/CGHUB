import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.AGENT_PRIVATE_KEY ??=
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const { createAgentHttpServer } = await import('../src/http-server.js');
const { JsonAgentRegistry } = await import('../src/agent-registry.js');
const { AgentRegistryContributionReviewStore } = await import('../src/contribution-review-store.js');

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert(address && typeof address === 'object');
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function tempRegistry() {
  const dir = mkdtempSync(join(tmpdir(), 'cghub-http-registry-'));
  const registry = new JsonAgentRegistry(join(dir, 'agent-registry.json'));
  return {
    registry,
    store: new AgentRegistryContributionReviewStore(registry),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('Agent HTTP API', () => {
  describe('round registry', () => {
    let server: Server;
    let baseUrl: string;

    before(async () => {
      server = createAgentHttpServer({
        roundRegistry: {
          async listRounds() {
            return [
              {
                id: 'cghub-1-1',
                projectId: '1',
                roundId: '1',
                activityName: 'CGHub Hackathon',
                roundName: '第一轮贡献结算',
                tokenAddress: '0x0000000000000000000000000000000000000001',
                tokenSymbol: 'USDC',
                ownerAddress: '0x1111111111111111111111111111111111111111',
                chainId: 11155111,
                poolAddress: '0x2222222222222222222222222222222222222222',
                status: 'scoring',
                funded: '100000000',
                totalScore: '87',
                contributorCount: 3,
                exists: true,
                finalized: false,
                createdAt: '2026-06-08T00:00:00.000Z',
                updatedAt: '2026-06-09T00:00:00.000Z',
              },
            ];
          },
          async getRound(id: string) {
            if (id !== 'cghub-1-1') return undefined;
            return {
              id: 'cghub-1-1',
              projectId: '1',
              roundId: '1',
              activityName: 'CGHub Hackathon',
              roundName: '第一轮贡献结算',
              tokenAddress: '0x0000000000000000000000000000000000000001',
              tokenSymbol: 'USDC',
              ownerAddress: '0x1111111111111111111111111111111111111111',
              chainId: 11155111,
              poolAddress: '0x2222222222222222222222222222222222222222',
              status: 'scoring',
              funded: '100000000',
              totalScore: '87',
              contributorCount: 3,
              exists: true,
              finalized: false,
              createdAt: '2026-06-08T00:00:00.000Z',
              updatedAt: '2026-06-09T00:00:00.000Z',
            };
          },
        },
      });
      baseUrl = await listen(server);
    });

    after(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    it('serves managed funding pools for the workspace pool list', async () => {
      const response = await fetch(`${baseUrl}/api/rounds`, {
        headers: { origin: 'http://localhost:3000' },
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.items.length, 1);
      assert.equal(body.items[0].activityName, 'CGHub Hackathon');
      assert.equal(body.items[0].roundName, '第一轮贡献结算');
      assert.equal(body.items[0].status, 'scoring');
      assert.equal(body.items[0].projectId, '1');
      assert.equal(body.items[0].roundId, '1');
    });

    it('serves one managed funding pool by registry id', async () => {
      const response = await fetch(`${baseUrl}/api/rounds/cghub-1-1`, {
        headers: { origin: 'http://localhost:3000' },
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.id, 'cghub-1-1');
      assert.equal(body.activityName, 'CGHub Hackathon');
    });
  });

  describe('contribution signing', () => {
    let server: Server;
    let baseUrl: string;

    before(async () => {
      server = createAgentHttpServer({
        async signContribution(args: any) {
          return {
            reviewStatus: 'auto_allowed',
            reviewId: 'review-dynamic-round-test',
            recorded: true,
            recordTxId: 'record-tx',
            txHash: '0xrecorded',
            score: 35,
            reason: 'mock scored',
            triggeredRules: [],
            signerMode: 'cobo',
            signerAddress: '0x1111111111111111111111111111111111111111',
            projectId: args.projectId,
            roundId: args.roundId,
          };
        },
      } as any);
      baseUrl = await listen(server);
    });

    after(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });

    it('rejects contribution signing without an explicit round scope', async () => {
      const response = await fetch(`${baseUrl}/api/sign-contribution`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({
          contributor: '0x1111111111111111111111111111111111111111',
          title: 'Missing round scope',
          amount: '1 PR',
          description: 'Should not fall back to the env default round.',
          source: 'frontend',
          evidenceId: 'missing-round-scope',
        }),
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error, '缺 projectId / roundId 参数');
    });

    it('records auto-allowed contributions for the round selected by the request', async () => {
      const response = await fetch(`${baseUrl}/api/sign-contribution`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({
          projectId: '42',
          roundId: '7',
          contributor: '0x1111111111111111111111111111111111111111',
          title: 'Dynamic round contribution',
          amount: '1 PR',
          description: 'Should be recorded against the selected round.',
          source: 'frontend',
          evidenceId: 'dynamic-round-test',
          paymentId: 'payment-dynamic-round-test',
        }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.reviewStatus, 'auto_allowed');
      assert.equal(body.recorded, true);
      assert.equal(body.txHash, '0xrecorded');
      assert.equal(body.proof, undefined);
      assert.equal(body.signature, undefined);
    });
  });

  describe('contribution submission', () => {
    let server: Server;
    let baseUrl: string;
    let cleanup: () => void;

    before(async () => {
      const temp = tempRegistry();
      cleanup = temp.cleanup;
      server = createAgentHttpServer({
        contributionReviewStore: temp.store,
        async submitContribution() {
          return { txHash: '0xrecorded' };
        },
      } as any);
      baseUrl = await listen(server);
    });

    after(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      cleanup();
    });

    it('rejects externally submitted proofs without a backend review record', async () => {
      const contributor = '0x1111111111111111111111111111111111111111';
      const response = await fetch(`${baseUrl}/api/submit-contribution`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({
          proof: {
            projectId: '42',
            roundId: '7',
            contributor,
            proofHash: '0x' + '11'.repeat(32),
          },
          signature: '0xsig',
        }),
      });

      assert.equal(response.status, 403);
      const body = await response.json();
      assert.match(body.error, /proof 未绑定已审批 review/);
    });
  });

  describe('contribution reviews', () => {
    let server: Server;
    let baseUrl: string;
    let cleanup: () => void;

    before(async () => {
      const temp = tempRegistry();
      cleanup = temp.cleanup;
      const { registry, store } = temp;
      const contributor = '0x1111111111111111111111111111111111111111';
      store.create({
        projectId: '42',
        roundId: '7',
        contributor,
        title: 'High score contribution',
        description: 'Needs review',
        source: 'frontend',
        evidenceId: 'review-evidence',
        evidenceUrl: 'https://github.com/org/repo/pull/456',
        paymentId: 'payment-review',
        score: 85,
        scoreReason: 'high score',
        status: 'pending_cobo_approval',
        reasons: ['单条评分 85 >= 80'],
        triggeredRules: ['score_threshold'],
        coboSignTxId: 'cobo-sign-tx',
        coboApprovalId: 'cobo-approval-id',
        coboSignStatus: 'pending',
      });
      registry.appendDecision({
        stage: 'review',
        projectId: '42',
        roundId: '7',
        contributor,
        result: 'pending',
        score: 85,
        reason: 'High score contribution requires Cobo approval',
        reviewStatus: 'pending_cobo_approval',
        triggeredRules: ['score_threshold'],
      });
      server = createAgentHttpServer({
        contributionReviewStore: store,
        agentRegistry: registry,
        async syncCoboApproval(review: any) {
          store.updateStatus(review.id, { status: 'cobo_approved' });
          const recorded = store.attachTxHash(review.id, {
            recordTxId: 'record-tx',
            txHash: '0xcoboapproved',
          });
          return { review: recorded, recordTxId: 'record-tx', txHash: '0xcoboapproved', status: 'success' };
        },
      } as any);
      baseUrl = await listen(server);
    });

    after(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      cleanup();
    });

    it('lists pending reviews without exposing proof or signatures', async () => {
      const response = await fetch(`${baseUrl}/api/reviews?status=pending_cobo_approval`);

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.items.length, 1);
      assert.equal(body.items[0].status, 'pending_cobo_approval');
      assert.equal(body.items[0].signature, undefined);
      assert.equal(body.items[0].proof, undefined);
    });

    it('syncs a Cobo-approved review and records it through CAW without exposing reusable proof', async () => {
      const reviews = await (await fetch(`${baseUrl}/api/reviews?status=pending_cobo_approval`)).json();
      const id = reviews.items[0].id;
      const response = await fetch(`${baseUrl}/api/reviews/${id}/sync-cobo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewer: '0x2222222222222222222222222222222222222222' }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.item.status, 'cobo_approved');
      assert.equal(body.item.recorded, true);
      assert.equal(body.item.txHash, '0xcoboapproved');
      assert.equal(body.item.signature, undefined);
      assert.equal(body.item.proof, undefined);
    });

    it('serves the persisted agent registry snapshot without reusable signatures', async () => {
      const response = await fetch(`${baseUrl}/api/agent-registry?projectId=42&roundId=7&limit=20`);

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.ok(body.reviews.length >= 1);
      assert.ok(body.decisions.length >= 1);
      assert.ok(body.activityEvents.length >= 1);
      assert.equal(body.reviews[0].signature, undefined);
      assert.equal(body.reviews[0].proof, undefined);
    });
  });

  describe('Cobo endpoints', () => {
    let server: Server;
    let baseUrl: string;
    let cleanup: () => void;
    const calls: Array<{
      action: string;
      amount?: string;
      projectId?: string;
      roundId?: string;
      contributor?: string;
      paymentRequired?: string;
      requestId?: string;
    }> = [];

    before(async () => {
      const temp = tempRegistry();
      cleanup = temp.cleanup;
      server = createAgentHttpServer({
        agentRegistry: temp.registry,
        async checkPending(args) {
          calls.push({
            action: 'checkPending',
            contributor: args.contributor,
            projectId: args.projectId?.toString(),
            roundId: args.roundId?.toString(),
          });
          return { pending: '10', score: '25', claimed: '5' };
        },
        walletAgent: {
          async getCoboStatus() {
            return {
              walletId: 'wallet-uuid',
              srcAddress: '0x1111111111111111111111111111111111111111',
              chainId: 'SETH',
              tokenId: 'SETH_USDC',
              mainPact: {
                id: 'main-pact',
                status: 'active',
                expiresAt: '2026-06-09T00:00:00.000Z',
                progressTxCount: 2,
                policies: [
                  {
                    name: 'cghub-pool-execution-scope',
                    rules: {
                      when: {
                        target_in: [
                          {
                            chain_id: 'SETH',
                            contract_addr: '0x876A0741223EDdaE081Ef22beA513E92335B1Bd5',
                          },
                        ],
                      },
                    },
                  },
                ],
              },
              signPact: {
                id: 'sign-pact',
                status: 'active',
                expiresAt: '2026-06-09T00:00:00.000Z',
                policies: [
                  {
                    name: 'cghub-contribution-proof-sign',
                    type: 'message_sign',
                    rules: {
                      when: {
                        chain_in: ['SETH'],
                      },
                    },
                  },
                ],
              },
              fundPact: {
                id: 'fund-pact',
                status: 'active',
                expiresAt: '2026-06-09T00:00:00.000Z',
                policies: [
                  {
                    name: 'cghub-treasury-funding-scope',
                    rules: {
                      when: {
                        target_in: [
                          {
                            chain_id: 'SETH',
                            contract_addr: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
                          },
                          {
                            chain_id: 'SETH',
                            contract_addr: '0x876A0741223EDdaE081Ef22beA513E92335B1Bd5',
                          },
                        ],
                      },
                    },
                  },
                ],
              },
              guardPact: {
                id: 'guard-pact',
                status: 'active',
                expiresAt: '2026-06-09T00:00:00.000Z',
              },
              pactStats: {
                totalPacts: 4,
                activePacts: 4,
                txCount: 3,
                volumeUsd: '0',
              },
              balances: [
                {
                  tokenId: 'SETH_USDC',
                  chainId: 'SETH',
                  address: '0x1111111111111111111111111111111111111111',
                  balance: '100',
                  symbol: 'USDC',
                },
              ],
              pendingOperations: [],
            };
          },
          async guardDemo(amount: string) {
            calls.push({ action: 'guardDemo', amount });
            const error = new Error('Policy denied: amount_gt 100') as Error & { response?: unknown };
            error.response = { data: { error: { reason: 'amount_gt 100' } } };
            throw error;
          },
          async fundRoundFromTreasury(
            amount: string,
            scope?: { projectId?: string | number | bigint; roundId?: string | number | bigint },
          ) {
            calls.push({
              action: 'fundRoundFromTreasury',
              amount,
              projectId: scope?.projectId?.toString(),
              roundId: scope?.roundId?.toString(),
            });
            return {
              approve: { txId: 'approve-tx', status: 'success', txHash: '0xapprove' },
              fund: { txId: 'fund-tx', status: 'success', txHash: '0xfund' },
            };
          },
          async checkPending(
            contributor: string,
            scope?: { projectId?: string | number | bigint; roundId?: string | number | bigint },
          ) {
            calls.push({
              action: 'checkPending',
              contributor,
              projectId: scope?.projectId?.toString(),
              roundId: scope?.roundId?.toString(),
            });
            return 10n;
          },
          async claimForContributor(
            contributor: string,
            scope?: { projectId?: string | number | bigint; roundId?: string | number | bigint },
          ) {
            calls.push({
              action: 'claimForContributor',
              contributor,
              projectId: scope?.projectId?.toString(),
              roundId: scope?.roundId?.toString(),
            });
            return { txId: 'claim-tx', status: 'success', hash: '0xclaim' };
          },
          async payX402(input: { paymentRequired: string; requestId?: string }) {
            calls.push({
              action: 'payX402',
              paymentRequired: input.paymentRequired,
              requestId: input.requestId,
            });
            return { id: 'payment-id', status: 'completed', retryHeaders: { 'X-PAYMENT': 'ok' } };
          },
        },
      });
      baseUrl = await listen(server);
    });

    after(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      cleanup();
    });

    it('returns display-safe Cobo wallet status', async () => {
      const response = await fetch(`${baseUrl}/api/cobo/status`, {
        headers: { origin: 'http://localhost:3000' },
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');

      const body = await response.json();
      assert.equal(body.walletId, 'wallet-uuid');
      assert.equal(body.srcAddress, '0x1111111111111111111111111111111111111111');
      assert.equal(body.mainPact.status, 'active');
      assert.deepEqual(body.mainPact.policies[0].rules.when.target_in, [
        {
          chain_id: 'SETH',
          contract_addr: '0x876A0741223EDdaE081Ef22beA513E92335B1Bd5',
        },
      ]);
      assert.equal(body.signPact.policies[0].type, 'message_sign');
      assert.deepEqual(body.fundPact.policies[0].rules.when.target_in, [
        {
          chain_id: 'SETH',
          contract_addr: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        },
        {
          chain_id: 'SETH',
          contract_addr: '0x876A0741223EDdaE081Ef22beA513E92335B1Bd5',
        },
      ]);
      assert.equal(body.guardPact.id, 'guard-pact');
      assert.equal(body.balances[0].tokenId, 'SETH_USDC');

      const serialized = JSON.stringify(body).toLowerCase();
      assert(!serialized.includes('api_key'));
      assert(!serialized.includes('apikey'));
      assert(!serialized.includes('privatekey'));
      assert(!serialized.includes('agent_private_key'));
    });

    it('exposes safety-probe as the public Cobo guard endpoint and records denied decisions', async () => {
      const response = await fetch(`${baseUrl}/api/cobo/safety-probe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ amount: '101' }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.blocked, true);
      assert.equal(body.amount, '101');
      assert.equal(body.reason, 'amount_gt 100');
      assert.deepEqual(calls.at(-1), { action: 'guardDemo', amount: '101' });

      const decisionsResponse = await fetch(`${baseUrl}/api/decisions?limit=5`);
      const decisions = await decisionsResponse.json();
      assert.equal(decisions.items[0].stage, 'guard');
      assert.equal(decisions.items[0].result, 'denied');
      assert.equal(decisions.items[0].amount, '101');
    });

    it('records Cobo treasury fund-round decisions through the HTTP route', async () => {
      const response = await fetch(`${baseUrl}/api/cobo/fund-round`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ amount: '100', projectId: '42', roundId: '7' }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.approve.txId, 'approve-tx');
      assert.equal(body.fund.txHash, '0xfund');
      assert.deepEqual(calls.at(-1), {
        action: 'fundRoundFromTreasury',
        amount: '100',
        projectId: '42',
        roundId: '7',
      });

      const decisionsResponse = await fetch(`${baseUrl}/api/decisions?limit=5`);
      const decisions = await decisionsResponse.json();
      assert.equal(decisions.items[0].stage, 'fund');
      assert.equal(decisions.items[0].result, 'allowed');
      assert.equal(decisions.items[0].amount, '100');
      assert.equal(decisions.items[0].txHash, '0xfund');
      assert.equal(decisions.items[0].projectId, '42');
      assert.equal(decisions.items[0].roundId, '7');
    });

    it('rejects Cobo treasury funding without an explicit round scope', async () => {
      const callCount = calls.length;
      const response = await fetch(`${baseUrl}/api/cobo/fund-round`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ amount: '100' }),
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error, '缺 projectId / roundId 参数');
      assert.equal(calls.length, callCount);
    });

    it('filters decision events by the selected round scope', async () => {
      const response = await fetch(`${baseUrl}/api/decisions?limit=20&projectId=42&roundId=7`);

      assert.equal(response.status, 200);
      const body = await response.json();
      assert(body.items.length > 0);
      assert(body.items.every((item: any) => item.projectId === '42' && item.roundId === '7'));
    });

    it('claims payouts from the round selected by the HTTP request', async () => {
      const contributor = '0x1111111111111111111111111111111111111111';
      const response = await fetch(`${baseUrl}/api/trigger-claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ contributor, projectId: '42', roundId: '7' }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.txHash, '0xclaim');
      assert.deepEqual(calls.slice(-2), [
        { action: 'checkPending', contributor, projectId: '42', roundId: '7' },
        { action: 'claimForContributor', contributor, projectId: '42', roundId: '7' },
      ]);

      const decisionsResponse = await fetch(`${baseUrl}/api/decisions?limit=5`);
      const decisions = await decisionsResponse.json();
      assert.equal(decisions.items[0].stage, 'claim');
      assert.equal(decisions.items[0].projectId, '42');
      assert.equal(decisions.items[0].roundId, '7');
    });

    it('fails agent-triggered claims fast when Cobo does not return', async () => {
      const previousTimeout = process.env.CAW_CLAIM_REQUEST_TIMEOUT_MS;
      process.env.CAW_CLAIM_REQUEST_TIMEOUT_MS = '25';
      const contributor = '0x1111111111111111111111111111111111111111';
      const server = createAgentHttpServer({
        walletAgent: {
          async getCoboStatus() {
            return {
              walletId: 'wallet-uuid',
              srcAddress: '0x1111111111111111111111111111111111111111',
              mainPact: { id: 'main-pact', status: 'active', policies: [] },
              signPact: { id: 'sign-pact', status: 'active', policies: [] },
              fundPact: undefined,
              guardPact: undefined,
              pactStats: {
                main: { id: 'main-pact', pendingOperations: 0 },
                sign: { id: 'sign-pact', pendingOperations: 0 },
                fund: undefined,
                guard: undefined,
              },
              balances: [],
              pendingOperations: 0,
            };
          },
          async guardDemo(amount: string) {
            return { txId: 'guard-tx', status: 'success', txHash: `0x${amount}` };
          },
          async fundRoundFromTreasury() {
            return {
              approve: { txId: 'approve-tx', status: 'success', txHash: '0xapprove' },
              fund: { txId: 'fund-tx', status: 'success', txHash: '0xfund' },
            };
          },
          async checkPending() {
            return 10n;
          },
          async claimForContributor() {
            return new Promise<never>(() => undefined);
          },
          async payX402() {
            return { id: 'payment-id', status: 'completed', retryHeaders: {} };
          },
        },
      });
      const scopedBaseUrl = await listen(server);

      try {
        const response = await fetch(`${scopedBaseUrl}/api/trigger-claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
          body: JSON.stringify({ contributor, projectId: '42', roundId: '7' }),
        });

        assert.equal(response.status, 500);
        const body = await response.json();
        assert.match(body.error, /Cobo 代领请求超时/);
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        if (previousTimeout === undefined) {
          delete process.env.CAW_CLAIM_REQUEST_TIMEOUT_MS;
        } else {
          process.env.CAW_CLAIM_REQUEST_TIMEOUT_MS = previousTimeout;
        }
      }
    });

    it('rejects agent-triggered claims without an explicit round scope', async () => {
      const contributor = '0x1111111111111111111111111111111111111111';
      const callCount = calls.length;
      const response = await fetch(`${baseUrl}/api/trigger-claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ contributor }),
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error, '缺 projectId / roundId 参数');
      assert.equal(calls.length, callCount);
    });

    it('reads pending payouts from the round selected by the HTTP query', async () => {
      const contributor = '0x1111111111111111111111111111111111111111';
      const response = await fetch(
        `${baseUrl}/api/pending?contributor=${contributor}&projectId=42&roundId=7`,
        { headers: { origin: 'http://localhost:3000' } },
      );

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.pending, '10');
      assert.deepEqual(calls.at(-1), {
        action: 'checkPending',
        contributor,
        projectId: '42',
        roundId: '7',
      });
    });

    it('rejects pending payout reads without an explicit round scope', async () => {
      const contributor = '0x1111111111111111111111111111111111111111';
      const callCount = calls.length;
      const response = await fetch(`${baseUrl}/api/pending?contributor=${contributor}`, {
        headers: { origin: 'http://localhost:3000' },
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error, '缺 projectId / roundId 参数');
      assert.equal(calls.length, callCount);
    });

    it('records Cobo x402 payment decisions through the HTTP route', async () => {
      const response = await fetch(`${baseUrl}/api/cobo/pay-x402`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ paymentRequired: 'challenge-base64', requestId: 'payment-1' }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.id, 'payment-id');
      assert.equal(body.retryHeaders['X-PAYMENT'], 'ok');
      assert.deepEqual(calls.at(-1), {
        action: 'payX402',
        paymentRequired: 'challenge-base64',
        requestId: 'payment-1',
      });

      const decisionsResponse = await fetch(`${baseUrl}/api/decisions?limit=5`);
      const decisions = await decisionsResponse.json();
      assert.equal(decisions.items[0].stage, 'payment');
      assert.equal(decisions.items[0].result, 'allowed');
      assert.equal(decisions.items[0].reason, 'Cobo payment(x402) completed');
    });
  });
});
