import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { JsonRoundRegistry } from '../src/round-registry.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const OWNER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x0000000000000000000000000000000000000001';
const POOL = '0x2222222222222222222222222222222222222222';

let tempDir = '';

async function registryWith(records: any[] = []) {
  tempDir = await mkdtemp(join(tmpdir(), 'cghub-round-registry-'));
  const registry = new JsonRoundRegistry(join(tempDir, 'rounds.json'));
  await registry.saveRecords(records as any);
  return registry;
}

afterEach(async () => {
  if (!tempDir) return;
  await rm(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('JsonRoundRegistry activity lifecycle', () => {
  it('suggests the next project id with round 1 for a new activity', async () => {
    const registry = await registryWith([
      record({ projectId: '7', roundId: '1' }),
      record({ id: 'second', projectId: '12', roundId: '3' }),
    ]);

    const next = await registry.suggestNextRoundScope();

    assert.deepEqual(next, {
      projectId: '13',
      roundId: '1',
      strategy: 'nextProjectIdRoundOne',
    });
  });

  it('creates a draft activity with metadata and a unique chain scope', async () => {
    const registry = await registryWith([record({ projectId: '7', roundId: '1' })]);

    const draft = await registry.createDraftActivity({
      activityTitle: 'CGHub Builder Sprint',
      activityDescription: '代码、宣传、组织贡献都纳入这一轮结算。',
      roundName: '第一轮',
      projectOwnerAddress: OWNER,
      tokenAddress: TOKEN,
      tokenSymbol: 'USDC',
      contributionGuide: '提交 PR、活动复盘或传播链接。',
      createdBy: OWNER,
    });

    assert.equal(draft.projectId, '8');
    assert.equal(draft.roundId, '1');
    assert.equal(draft.activityName, 'CGHub Builder Sprint');
    assert.equal(draft.activityDescription, '代码、宣传、组织贡献都纳入这一轮结算。');
    assert.equal(draft.roundName, '第一轮');
    assert.equal(draft.ownerAddress, OWNER);
    assert.equal(draft.createdBy, OWNER);
    assert.equal(draft.status, 'draft');

    const saved = await registry.getRound(draft.id);
    assert.equal(saved?.activityName, 'CGHub Builder Sprint');
    assert.equal(saved?.contributionGuide, '提交 PR、活动复盘或传播链接。');
  });

  it('rejects duplicate projectId and roundId pairs', async () => {
    const registry = await registryWith([record({ projectId: '7', roundId: '1' })]);

    await assert.rejects(
      registry.createDraftActivity({
        activityTitle: 'Duplicate',
        activityDescription: 'Should not be saved.',
        roundName: '重复轮次',
        projectOwnerAddress: OWNER,
        projectId: '7',
        roundId: '1',
      }),
      /projectId \/ roundId 已存在/
    );
  });

  it('marks created and finalized lifecycle metadata after chain transactions', async () => {
    const registry = await registryWith([]);
    const draft = await registry.createDraftActivity({
      activityTitle: 'CGHub Builder Sprint',
      activityDescription: '代码、宣传、组织贡献都纳入这一轮结算。',
      roundName: '第一轮',
      projectOwnerAddress: OWNER,
      projectId: '20',
      roundId: '1',
    });

    const created = await registry.markRoundCreated(draft.id, {
      createTxHash: '0xcreate',
      createdBy: OWNER,
    });
    assert.equal(created.status, 'open');
    assert.equal(created.createTxHash, '0xcreate');
    assert.equal(created.lastError, undefined);

    const finalized = await registry.markRoundFinalized(draft.id, {
      finalizeTxHash: '0xfinalize',
      finalizedBy: OWNER,
    });
    assert.equal(finalized.status, 'finalized');
    assert.equal(finalized.finalizeTxHash, '0xfinalize');
    assert.equal(finalized.finalizedBy, OWNER);
    assert.match(finalized.endedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
  });
});

function record(overrides: Record<string, unknown> = {}) {
  const now = '2026-06-09T00:00:00.000Z';
  return {
    id: 'project-7-round-1',
    projectId: '7',
    roundId: '1',
    activityName: 'Existing Activity',
    roundName: 'Existing Round',
    tokenAddress: TOKEN,
    tokenSymbol: 'USDC',
    ownerAddress: ZERO,
    chainId: 11155111,
    poolAddress: POOL,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
