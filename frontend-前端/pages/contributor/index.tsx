import { ContributorActivityCard } from "../../components/ContributorActivityCard";
import { ContributorShell } from "../../components/ContributorShell";
import { EmptyState } from "../../components/ledger/EmptyState";
import { LedgerNotice } from "../../components/ledger/LedgerNotice";
import { LedgerPanel } from "../../components/ledger/LedgerPanel";
import { LedgerStatCard } from "../../components/ledger/LedgerStatCard";
import { LoadingSkeleton } from "../../components/ledger/LoadingSkeleton";
import { PageSection } from "../../components/ledger/PageSection";
import { RoleButton } from "../../components/ledger/RoleButton";
import { useContributorPortfolio } from "../../hooks/useContributorPortfolio";
import { useManagedRounds } from "../../hooks/useManagedRounds";
import { useWallet } from "../../hooks/useWallet";
import { splitActivityCards } from "../../lib/activity-workspace";
import type { ContributorActivityCard as ContributorActivityCardModel } from "../../lib/contributor-workspace";
import { formatUsdc } from "../../lib/settlement-workspace";

export default function ContributorHomePage() {
  const wallet = useWallet();
  const { rounds, loading, error } = useManagedRounds();
  const portfolioState = useContributorPortfolio(rounds, wallet.address);
  const portfolio = portfolioState.portfolio;
  const groups = splitActivityCards(portfolio.activities, { includeDraft: false });

  return (
    <ContributorShell
      wallet={wallet}
      title="贡献者活动"
      subtitle="查看进行中和已结束的活动，跟踪你的分数、待领取和已领取收益。"
    >
      <section id="portfolio" className="my-6 grid gap-y-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgba(255,253,247,0.64)] p-3 sm:grid-cols-2 xl:grid-cols-4">
        <LedgerStatCard label="总已领取" value={formatUsdc(portfolio.totalClaimed)} />
        <LedgerStatCard label="待领取" value={formatUsdc(portfolio.totalPending)} />
        <LedgerStatCard label="有分数的活动" value={`${portfolio.scoredActivityCount}`} />
        <LedgerStatCard label="可参与活动" value={`${groups.ongoing.length}`} />
      </section>

      {!wallet.isConnected && (
        <LedgerPanel variant="primary" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <span className="role-kicker">我的收益</span>
            <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">
              连接钱包后显示你的分数和领取记录
            </h2>
            <p>活动列表会先展示公开状态；个人分数、待领取和已领取资金会在连接钱包后按活动读取。</p>
          </div>
          <RoleButton onClick={wallet.connectWallet} disabled={wallet.isLoading}>
            {wallet.isLoading ? "连接中..." : "连接钱包"}
          </RoleButton>
        </LedgerPanel>
      )}

      {(error || portfolioState.error) && <LedgerNotice tone="error">{error || portfolioState.error}</LedgerNotice>}
      {(loading || portfolioState.loading) && <LoadingSkeleton rows={3} />}

      <ActivitySection
        title="进行中活动"
        description="开放、已注资和评分中的活动会显示在这里。"
        activities={groups.ongoing}
      />

      <ActivitySection
        id="ended"
        title="已结束活动"
        description="已关闭、已结清或归档的活动保留在这里，方便查看最终分数和领取结果。"
        activities={groups.ended}
        emptyText="暂无已结束活动。"
      />
    </ContributorShell>
  );
}

function ActivitySection({
  id,
  title,
  description,
  activities,
  emptyText = "暂无进行中活动。",
}: {
  id?: string;
  title: string;
  description: string;
  activities: ContributorActivityCardModel[];
  emptyText?: string;
}) {
  return (
    <PageSection id={id} title={title} description={description} count={activities.length}>
      {activities.length === 0 ? (
        <EmptyState description={emptyText} />
      ) : (
        <div className="grid gap-3">
          {activities.map((activity) => (
            <ContributorActivityCard key={activity.roundRegistryId} activity={activity} />
          ))}
        </div>
      )}
    </PageSection>
  );
}
