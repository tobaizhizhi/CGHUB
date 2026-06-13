import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useRouter } from "next/router";
import { ManagerShell } from "../../../components/ManagerShell";
import { ActivityDossierHeader, LedgerStamp } from "../../../components/ledger/ActivityDossierHeader";
import { LedgerNotice } from "../../../components/ledger/LedgerNotice";
import { LedgerPanel } from "../../../components/ledger/LedgerPanel";
import { RoleButton } from "../../../components/ledger/RoleButton";
import { useContributionPool, USDC_ADDRESS } from "../../../hooks/useContributionPool";
import { useWallet } from "../../../hooks/useWallet";
import {
  checkRoundIdAvailability,
  createDraftActivity,
  getNextRoundId,
  markActivityCreated,
  type RoundIdAvailabilityResponse,
} from "../../../lib/agent-api";
import { shortAddress } from "../../../lib/settlement-workspace";
import { cn } from "../../../lib/utils";

interface ActivityFormState {
  activityTitle: string;
  activityDescription: string;
  roundName: string;
  creatorAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  startsAt: string;
  endsAt: string;
  projectId: string;
  roundId: string;
}

const initialForm: ActivityFormState = {
  activityTitle: "",
  activityDescription: "",
  roundName: "第一轮",
  creatorAddress: "",
  tokenAddress: USDC_ADDRESS,
  tokenSymbol: "USDC",
  startsAt: "",
  endsAt: "",
  projectId: "",
  roundId: "",
};

export default function NewManagerActivityPage() {
  const wallet = useWallet();
  const router = useRouter();
  const [form, setForm] = useState<ActivityFormState>(initialForm);
  const [manualIds, setManualIds] = useState(false);
  const [availability, setAvailability] = useState<RoundIdAvailabilityResponse | null>(null);
  const [loadingIds, setLoadingIds] = useState(true);
  const [checkingIds, setCheckingIds] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draftId, setDraftId] = useState("");
  const [createdTxHash, setCreatedTxHash] = useState("");

  const pool = useContributionPool(wallet.address, wallet.signer, {
    projectId: form.projectId || "1",
    roundId: form.roundId || "1",
  });

  useEffect(() => {
    let alive = true;
    setLoadingIds(true);
    getNextRoundId()
      .then((next) => {
        if (!alive) return;
        setForm((current) => ({
          ...current,
          projectId: current.projectId || next.projectId,
          roundId: current.roundId || next.roundId,
        }));
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "无法获取建议 ID");
      })
      .finally(() => {
        if (alive) setLoadingIds(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!wallet.address || form.creatorAddress) return;
    setForm((current) => ({ ...current, creatorAddress: current.creatorAddress || wallet.address || "" }));
  }, [form.creatorAddress, wallet.address]);

  useEffect(() => {
    if (!form.projectId || !form.roundId) {
      setAvailability(null);
      return;
    }

    let alive = true;
    setCheckingIds(true);
    checkRoundIdAvailability({ projectId: form.projectId, roundId: form.roundId })
      .then((result) => {
        if (alive) setAvailability(result);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "ID 可用性检查失败");
      })
      .finally(() => {
        if (alive) setCheckingIds(false);
      });

    return () => {
      alive = false;
    };
  }, [form.projectId, form.roundId]);

  const chainConflict = Boolean(pool.round?.exists);
  const canSubmit = useMemo(() => {
    return !submitting && !loadingIds && availability?.available !== false && !chainConflict;
  }, [availability?.available, chainConflict, loadingIds, submitting]);

  const updateField =
    (field: keyof ActivityFormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setError("");
      setMessage("");
    };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setDraftId("");
    setCreatedTxHash("");

    const validationError = validateForm(form, wallet.isConnected);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      setMessage("正在保存活动草稿...");
      const draft = await createDraftActivity({
        activityTitle: form.activityTitle,
        activityDescription: form.activityDescription,
        roundName: form.roundName,
        projectOwnerAddress: form.creatorAddress,
        tokenAddress: form.tokenAddress,
        tokenSymbol: form.tokenSymbol,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        projectId: form.projectId,
        roundId: form.roundId,
        createdBy: wallet.address || undefined,
      });
      setDraftId(draft.item.id);

      setMessage("草稿已保存，正在请求钱包创建链上资金池...");
      const txHash = await pool.createRound(form.tokenAddress);
      setCreatedTxHash(txHash);

      setMessage("链上资金池已创建，正在回写活动状态...");
      await markActivityCreated(draft.item.id, {
        createTxHash: txHash,
        createdBy: wallet.address || undefined,
      });

      setMessage("活动已创建，正在进入管理详情...");
      await router.push(`/manager/activities/${encodeURIComponent(draft.item.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建活动失败");
      setMessage("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ManagerShell
      wallet={wallet}
      title="创建活动档案"
      subtitle="填写活动展示信息，分配链上 projectId / roundId，并由管理者钱包新开资金池。"
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 max-sm:flex-col max-sm:items-stretch">
        <Link href="/manager">返回管理者总控</Link>
        <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">
          {wallet.address ? `创建者 ${shortAddress(wallet.address)}` : "等待连接管理者钱包"}
        </span>
      </div>

      <ActivityDossierHeader
        eyebrow="活动档案录入"
        title="创建活动并新开资金池"
        description="提交后会先保存活动标题、描述和轮次，再调用合约创建对应的 projectId / roundId 资金池。"
        stamp={<LedgerStamp label="写链动作" value="createRound" footer="管理者钱包" />}
      />

      <form className="mt-6 grid gap-5" onSubmit={submit}>
        <LedgerPanel as="article" className="grid gap-5">
          <div className="flex items-start justify-between gap-4 max-sm:flex-col">
            <div>
              <span className="role-kicker">活动元数据</span>
              <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">活动基础信息</h2>
            </div>
            <span className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-3 py-2 font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">
              Step 01
            </span>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)]">
            <div className="grid gap-4">
              <FormField label="活动标题">
                <input
                  className={fieldControlClass}
                  value={form.activityTitle}
                  onChange={updateField("activityTitle")}
                  placeholder="CGHub Builder Sprint"
                  required
                />
              </FormField>
              <FormField label="活动描述">
                <textarea
                  className={fieldControlClass}
                  value={form.activityDescription}
                  onChange={updateField("activityDescription")}
                  placeholder="说明活动目标、规则、贡献范围和结算标准。"
                  rows={5}
                  required
                />
              </FormField>
            </div>
            <div className="grid content-start gap-4 border-l border-[var(--line)] pl-5 max-xl:border-l-0 max-xl:border-t max-xl:pl-0 max-xl:pt-4">
              <FormField label="轮次名称">
                <input className={fieldControlClass} value={form.roundName} onChange={updateField("roundName")} required />
              </FormField>
            </div>
          </div>
        </LedgerPanel>

        <LedgerPanel as="article" variant="primary" className="grid gap-6">
          <div className="flex items-start justify-between gap-4 max-sm:flex-col">
            <div>
              <span className="role-kicker">链上资金池</span>
              <h2 className="mt-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">Project / Round 绑定</h2>
            </div>
            <span className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--role-color)_28%,var(--line))] bg-[rgba(255,253,247,0.66)] px-3 py-2 font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">
              Step 02
            </span>
          </div>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.48fr)]">
            <div className="grid gap-5">
              <FieldGroup title="创建者">
                <FormField label="创建者地址">
                  <input
                    className={fieldControlClass}
                    value={form.creatorAddress}
                    onChange={updateField("creatorAddress")}
                    placeholder="0x..."
                    required
                  />
                </FormField>
              </FieldGroup>

              <FieldGroup title="资金代币">
                <div className="grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)]">
                  <FormField label="符号">
                    <input className={fieldControlClass} value={form.tokenSymbol} onChange={updateField("tokenSymbol")} />
                  </FormField>
                  <FormField label="代币地址">
                    <input className={fieldControlClass} value={form.tokenAddress} onChange={updateField("tokenAddress")} required />
                  </FormField>
                </div>
              </FieldGroup>

              <FieldGroup title="活动时间">
                <div className="grid gap-4 lg:grid-cols-2">
                  <FormField label="开始时间">
                    <input className={fieldControlClass} type="datetime-local" value={form.startsAt} onChange={updateField("startsAt")} />
                  </FormField>
                  <FormField label="计划结束">
                    <input className={fieldControlClass} type="datetime-local" value={form.endsAt} onChange={updateField("endsAt")} />
                  </FormField>
                </div>
              </FieldGroup>
            </div>

            <div className="grid content-start gap-5 border-l border-[color-mix(in_srgb,var(--role-color)_22%,var(--line))] pl-6 max-2xl:border-l-0 max-2xl:border-t max-2xl:pl-0 max-2xl:pt-5">
              <FieldGroup
                title="链上 ID"
                action={
                  <label className="flex items-center gap-2 font-[var(--font-mono)] text-xs font-extrabold text-[var(--ink-soft)]">
                    手动编辑
                    <input
                      className="h-5 w-5 accent-[var(--role-color)]"
                      type="checkbox"
                      checked={manualIds}
                      onChange={(event) => setManualIds(event.target.checked)}
                    />
                  </label>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                  <FormField label="Project ID">
                    <input
                      className={fieldControlClass}
                      value={form.projectId}
                      onChange={updateField("projectId")}
                      disabled={!manualIds}
                      inputMode="numeric"
                      required
                    />
                  </FormField>
                  <FormField label="Round ID">
                    <input
                      className={fieldControlClass}
                      value={form.roundId}
                      onChange={updateField("roundId")}
                      disabled={!manualIds}
                      inputMode="numeric"
                      required
                    />
                  </FormField>
                </div>
              </FieldGroup>

              <FieldGroup title="状态检查">
                <div className="grid gap-3 sm:grid-cols-3 2xl:grid-cols-1">
                  <StatusLine label="建议 ID" value={loadingIds ? "读取中..." : `${form.projectId || "-"} / ${form.roundId || "-"}`} />
                  <StatusLine
                    label="链下检查"
                    value={
                      checkingIds
                        ? "检查中..."
                        : availability?.available
                          ? "可用"
                          : availability?.reason || "等待填写"
                    }
                  />
                  <StatusLine label="链上检查" value={pool.loading ? "读取中..." : chainConflict ? "已存在" : "未创建"} />
                </div>
              </FieldGroup>

              <div className="grid gap-3 border-t border-[var(--line)] pt-4">
                <RoleButton type="submit" disabled={!canSubmit} fullWidth>
                  {submitting ? "创建中..." : "创建活动并新开资金池"}
                </RoleButton>
                {!wallet.isConnected && <LedgerNotice tone="muted">需要连接合约 owner / 管理者钱包后才能创建资金池。</LedgerNotice>}
                {availability?.available === false && <LedgerNotice tone="error">{availability.reason}</LedgerNotice>}
                {chainConflict && <LedgerNotice tone="error">当前 projectId / roundId 的链上资金池已经存在。</LedgerNotice>}
              </div>
            </div>
          </div>
        </LedgerPanel>
      </form>

      {(message || error || draftId || createdTxHash) && (
        <LedgerPanel className="mt-5">
          <span className="role-kicker">创建状态</span>
          {message && <LedgerNotice tone="success">{message}</LedgerNotice>}
          {error && <LedgerNotice tone="error">{error}</LedgerNotice>}
          {draftId && (
            <p>
              草稿：
              <Link href={`/manager/activities/${encodeURIComponent(draftId)}`}>{draftId}</Link>
            </p>
          )}
          {createdTxHash && <p>创建交易：{createdTxHash}</p>}
        </LedgerPanel>
      )}
    </ManagerShell>
  );
}

const fieldControlClass = cn(
  "min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-3 py-2.5",
  "font-[var(--font-mono)] text-sm text-[var(--ink)] outline-none transition",
  "placeholder:text-[var(--dim)] focus:border-[color-mix(in_srgb,var(--role-color)_62%,var(--line))] focus:bg-white focus:shadow-[0_0_0_3px_var(--role-soft)]",
  "disabled:cursor-not-allowed disabled:bg-[var(--paper-soft)] disabled:text-[var(--dim)]"
);

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function FieldGroup({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-[color-mix(in_srgb,var(--role-color)_18%,var(--line))] pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-[76px] rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgba(255,253,247,0.66)] p-3">
      <span className="block font-[var(--font-mono)] text-[0.7rem] font-extrabold text-[var(--muted)]">{label}</span>
      <strong className="mt-1.5 block break-words font-[var(--font-mono)] text-sm text-[var(--ink)]">{value}</strong>
    </div>
  );
}

function validateForm(form: ActivityFormState, walletConnected: boolean) {
  if (!walletConnected) return "请先连接管理者钱包。";
  if (!form.activityTitle.trim()) return "活动标题不能为空。";
  if (!form.activityDescription.trim()) return "活动描述不能为空。";
  if (!form.roundName.trim()) return "轮次名称不能为空。";
  if (!form.creatorAddress.trim()) return "创建者地址不能为空。";
  if (!form.tokenAddress.trim()) return "代币地址不能为空。";
  if (!/^\d+$/.test(form.projectId) || BigInt(form.projectId) <= 0n) return "Project ID 必须是正整数。";
  if (!/^\d+$/.test(form.roundId) || BigInt(form.roundId) <= 0n) return "Round ID 必须是正整数。";
  return "";
}
