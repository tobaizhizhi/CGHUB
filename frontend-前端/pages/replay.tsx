import { ethers } from "ethers";
import Link from "next/link";
import { AuditTrail } from "../components/AuditTrail";
import { WalletConnect } from "../components/WalletConnect";
import { DetailGrid } from "../components/ledger/DetailGrid";
import { EmptyState } from "../components/ledger/EmptyState";
import { LedgerNotice } from "../components/ledger/LedgerNotice";
import { LedgerPanel } from "../components/ledger/LedgerPanel";
import { LedgerStatCard } from "../components/ledger/LedgerStatCard";
import { PageSection } from "../components/ledger/PageSection";
import { RoleButton, roleButtonClass } from "../components/ledger/RoleButton";
import { useAuditTrail } from "../hooks/useAuditTrail";
import { PoolActivity, useContributionPool } from "../hooks/useContributionPool";
import { useWallet } from "../hooks/useWallet";

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID || "1";
const ROUND_ID = process.env.NEXT_PUBLIC_ROUND_ID || "1";

export default function Replay() {
  const {
    address,
    signer,
    chainId,
    shortAddress,
    isConnected,
    isLoading,
    error,
    connectWallet,
    disconnect,
  } = useWallet();
  const {
    round,
    score,
    claimed,
    pending,
    owner,
    agentSigner,
    activities,
    loading,
    error: contractError,
    refresh,
  } = useContributionPool(address, signer);
  const {
    audit,
    loading: auditLoading,
    error: auditError,
    refresh: refreshAudit,
  } = useAuditTrail({ limit: 200, intervalMs: 8000 });

  const contributionActivities = activities.filter((activity) => activity.type === "contribution");

  return (
    <main className="role-manager min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto grid max-w-[1240px] gap-5">
        <header className="grid gap-4 border-b border-[var(--line)] pb-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div>
            <span className="inline-flex min-h-6 items-center rounded-full border border-[color-mix(in_srgb,var(--role-color)_35%,var(--line))] bg-[var(--role-soft)] px-2.5 py-1 font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">
              复盘
            </span>
            <h1 className="mt-3 font-[var(--font-display)] text-4xl leading-tight text-[var(--ink)] md:text-4xl">Round 复盘</h1>
            <p className="mt-3 max-w-3xl text-[var(--ink-soft)]">完整 round 状态、链上事件、贡献明细与 Cobo 审计记录（最多 200 条）。</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">项目 {PROJECT_ID}</span>
              <span className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">Round {ROUND_ID}</span>
              <span className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">Sepolia 审计</span>
            </div>
          </div>
          <div className="grid gap-3">
            <WalletConnect
              address={address}
              isConnected={isConnected}
              isLoading={isLoading}
              error={error}
              chainId={chainId}
              onConnect={connectWallet}
              onDisconnect={disconnect}
            />
            <Link href="/" className={roleButtonClass({ variant: "secondary" })}>
              返回工作台
            </Link>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <LedgerPanel as="article">
            <span className="role-kicker">链上 Round</span>
            <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">合约状态</h2>
            <p className="mt-2 text-[var(--muted)]">项目 / Round 来自环境变量，数据从 Sepolia 合约读取。</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <LedgerStatCard label="项目 / Round" value={`${PROJECT_ID} / ${ROUND_ID}`} />
              <LedgerStatCard label="代币" value={round?.token || "-"} />
              <LedgerStatCard label="已注资" value={formatUsdc(round?.funded)} />
              <LedgerStatCard label="总分" value={round?.totalScore || "0"} />
              <LedgerStatCard label="已创建" value={round?.exists ? "是" : "否"} />
              <LedgerStatCard label="已关闭" value={round?.finalized ? "是" : "否"} />
            </div>
          </LedgerPanel>

          <LedgerPanel as="article" variant="primary">
            <span className="role-kicker">读取状态</span>
            <DetailGrid
              items={[
                { label: "合约读取", value: loading ? "加载中..." : contractError || "正常" },
                { label: "当前钱包", value: address ? shortAddress : "未连接" },
                { label: "项目方", value: short(owner) },
                { label: "Agent 签名地址", value: short(agentSigner) },
                { label: "我的分数", value: score },
                { label: "已领取", value: formatUsdc(claimed) },
                { label: "可领取", value: formatUsdc(pending) },
              ]}
            />
            {contractError && <LedgerNotice tone="error" className="mt-3">{contractError}</LedgerNotice>}
            <RoleButton className="mt-4" variant="secondary" onClick={refresh} disabled={loading}>
              {loading ? "刷新中..." : "刷新链上数据"}
            </RoleButton>
          </LedgerPanel>
        </section>

        <PageSection title="链上事件" description="来自 ContributionPool 的 funded / contribution / finalized / claimed 事件。">
          <LedgerPanel className="grid gap-2">
            {activities.length === 0 ? (
              <EmptyState description="最近区块内暂无事件。" />
            ) : (
              activities.map((activity) => <ReplayActivity key={activity.id} activity={activity} />)
            )}
          </LedgerPanel>
        </PageSection>

        <PageSection title="本轮贡献明细" description="贡献者、链上分数与交易记录均来自结构化事件字段。">
          {contributionActivities.length === 0 ? (
            <EmptyState description="暂无链上贡献记录。" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {contributionActivities.map((item) => (
                <LedgerPanel key={item.id} as="article">
                  <h3 className="m-0 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{item.title}</h3>
                  <DetailGrid
                    items={[
                      { label: "贡献者", value: short(item.contributor) },
                      { label: "分数", value: item.score || "-" },
                      { label: "区块", value: `#${item.blockNumber}` },
                    ]}
                  />
                  <a
                    className={roleButtonClass({ variant: "outline", size: "sm" })}
                    href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看交易
                  </a>
                </LedgerPanel>
              ))}
            </div>
          )}
        </PageSection>

        <AuditTrail
          audit={audit}
          loading={auditLoading}
          error={auditError}
          onRefresh={refreshAudit}
        />
      </div>
    </main>
  );
}

function ReplayActivity({ activity }: { activity: PoolActivity }) {
  return (
    <article className="grid gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <strong className="font-[var(--font-display)] text-xl leading-tight text-[var(--ink)]">{activity.title}</strong>
        <p className="mt-1 text-sm text-[var(--muted)]">{activity.detail}</p>
        <p className="mt-1 font-[var(--font-mono)] text-xs text-[var(--muted)]">{activity.ts ? new Date(activity.ts).toLocaleString() : "区块时间未读取"}</p>
        <p className="mt-1 break-words font-[var(--font-mono)] text-xs text-[var(--muted)]">
          {activity.contributor ? `贡献者=${activity.contributor}` : ""}
          {activity.score ? ` 分数=${activity.score}` : ""}
          {activity.amount ? ` 金额=${formatUsdc(activity.amount)}` : ""}
        </p>
      </div>
      <a
        className={roleButtonClass({ variant: "outline", size: "sm" })}
        href={`https://sepolia.etherscan.io/tx/${activity.txHash}`}
        target="_blank"
        rel="noreferrer"
      >
        #{activity.blockNumber}
      </a>
    </article>
  );
}

function short(value?: string) {
  if (!value) return "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatUsdc(value?: string) {
  if (!value || value === "-") return "0 USDC";
  try {
    return `${ethers.formatUnits(value, 6)} USDC`;
  } catch {
    return value;
  }
}
