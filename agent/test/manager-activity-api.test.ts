import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

const { createAgentHttpServer } = await import('../src/http-server.js');

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

describe('Manager activity API', () => {
  let server: Server;
  let baseUrl: string;
  const calls: Array<{ action: string; id?: string; payload?: any }> = [];

  const registry = {
    async listRounds() {
      return [];
    },
    async getRound() {
      return undefined;
    },
    async suggestNextRoundScope() {
      calls.push({ action: 'next' });
      return { projectId: '42', roundId: '1', strategy: 'nextProjectIdRoundOne' as const };
    },
    async checkRoundIdAvailability(input: { projectId: string; roundId: string }) {
      calls.push({ action: 'availability', payload: input });
      return {
        available: input.projectId !== '7',
        registryExists: input.projectId === '7',
        chainExists: false,
        reason: input.projectId === '7' ? 'projectId / roundId 已存在' : undefined,
      };
    },
    async createDraftActivity(input: any) {
      calls.push({ action: 'draft', payload: input });
      return {
        id: 'project-42-round-1',
        projectId: '42',
        roundId: '1',
        activityName: input.activityTitle,
        activityDescription: input.activityDescription,
        roundName: input.roundName,
        tokenAddress: input.tokenAddress,
        tokenSymbol: input.tokenSymbol,
        ownerAddress: input.projectOwnerAddress,
        chainId: 11155111,
        poolAddress: '0x2222222222222222222222222222222222222222',
        status: 'draft',
        contributorCount: 0,
        createdAt: '2026-06-09T00:00:00.000Z',
        updatedAt: '2026-06-09T00:00:00.000Z',
      };
    },
    async markRoundCreated(id: string, input: any) {
      calls.push({ action: 'mark-created', id, payload: input });
      return {
        id,
        projectId: '42',
        roundId: '1',
        activityName: 'CGHub Builder Sprint',
        roundName: '第一轮',
        tokenAddress: '0x0000000000000000000000000000000000000001',
        tokenSymbol: 'USDC',
        ownerAddress: '0x1111111111111111111111111111111111111111',
        chainId: 11155111,
        poolAddress: '0x2222222222222222222222222222222222222222',
        status: 'open',
        createTxHash: input.createTxHash,
        contributorCount: 0,
        createdAt: '2026-06-09T00:00:00.000Z',
        updatedAt: '2026-06-09T00:00:00.000Z',
      };
    },
    async markRoundFinalized(id: string, input: any) {
      calls.push({ action: 'mark-finalized', id, payload: input });
      return {
        id,
        projectId: '42',
        roundId: '1',
        activityName: 'CGHub Builder Sprint',
        roundName: '第一轮',
        tokenAddress: '0x0000000000000000000000000000000000000001',
        tokenSymbol: 'USDC',
        ownerAddress: '0x1111111111111111111111111111111111111111',
        chainId: 11155111,
        poolAddress: '0x2222222222222222222222222222222222222222',
        status: 'finalized',
        finalizeTxHash: input.finalizeTxHash,
        endedAt: '2026-06-09T01:00:00.000Z',
        contributorCount: 0,
        createdAt: '2026-06-09T00:00:00.000Z',
        updatedAt: '2026-06-09T01:00:00.000Z',
      };
    },
  };

  before(async () => {
    server = createAgentHttpServer({ roundRegistry: registry });
    baseUrl = await listen(server);
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('returns the next manager activity chain scope', async () => {
    const response = await fetch(`${baseUrl}/api/manager/next-round-id`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      projectId: '42',
      roundId: '1',
      strategy: 'nextProjectIdRoundOne',
    });
  });

  it('checks round id availability before creating an activity', async () => {
    const response = await fetch(`${baseUrl}/api/manager/round-id-availability?projectId=7&roundId=1`);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.available, false);
    assert.equal(body.registryExists, true);
  });

  it('creates a draft activity record for the manager form', async () => {
    const response = await fetch(`${baseUrl}/api/manager/activities/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        activityTitle: 'CGHub Builder Sprint',
        activityDescription: '代码、宣传、组织贡献都纳入这一轮结算。',
        roundName: '第一轮',
        projectOwnerAddress: '0x1111111111111111111111111111111111111111',
        tokenAddress: '0x0000000000000000000000000000000000000001',
        tokenSymbol: 'USDC',
      }),
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.item.id, 'project-42-round-1');
    assert.equal(body.item.activityName, 'CGHub Builder Sprint');
    assert.equal(calls.find((call) => call.action === 'draft')?.payload.roundName, '第一轮');
  });

  it('marks an activity as created after createRound succeeds', async () => {
    const response = await fetch(`${baseUrl}/api/manager/activities/project-42-round-1/mark-created`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        createTxHash: '0xcreate',
        createdBy: '0x1111111111111111111111111111111111111111',
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.item.status, 'open');
    assert.equal(body.item.createTxHash, '0xcreate');
  });

  it('marks an activity as finalized after finalizeRound succeeds', async () => {
    const response = await fetch(`${baseUrl}/api/manager/activities/project-42-round-1/mark-finalized`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        finalizeTxHash: '0xfinalize',
        finalizedBy: '0x1111111111111111111111111111111111111111',
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.item.status, 'finalized');
    assert.equal(body.item.finalizeTxHash, '0xfinalize');
    assert.equal(body.item.endedAt, '2026-06-09T01:00:00.000Z');
  });
});
