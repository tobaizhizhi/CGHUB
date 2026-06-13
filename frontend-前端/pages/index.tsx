import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  Code2,
  FileSignature,
  GitBranch,
  Landmark,
  LucideIcon,
  ReceiptText,
  Scale,
  ShieldCheck,
  Sprout,
  WalletCards,
  Workflow,
} from "lucide-react";
import { ENTRY_INTENT_OPTIONS, type EntryIntent } from "../lib/entry-intent";
import { roleButtonClass } from "../components/ledger/RoleButton";
import { cn } from "../lib/utils";

const roleDetails: Record<
  EntryIntent,
  { accent: string; index: string; steps: string[]; cta: string; icon: LucideIcon; summary: string }
> = {
  project: {
    accent: "资金入口",
    index: "01",
    steps: ["查看活动资金池", "给活动注资", "跟踪结算状态"],
    cta: "进入项目方工作台",
    icon: Landmark,
    summary: "活动资金、注资和结算状态统一进入链上账本。",
  },
  contributor: {
    accent: "贡献入口",
    index: "02",
    steps: ["提交贡献证据", "等待 AI / Cobo 审批", "领取活动收益"],
    cta: "进入贡献者工作台",
    icon: Sprout,
    summary: "贡献者提交证据，评分通过后按链上分数领取收益。",
  },
  manager: {
    accent: "管理入口",
    index: "03",
    steps: ["创建活动档案", "新开链上资金池", "关闭活动结算"],
    cta: "进入管理者工作台",
    icon: ShieldCheck,
    summary: "管理者负责活动生命周期、资金池状态和最终结算。",
  },
};

const capabilityTags = [
  "Activity funding",
  "AI rubric",
  "Cobo App approval",
  "EIP-712",
  "CAW execution",
  "Gasless claim",
  "Agent Registry",
];

const flowSteps = [
  { label: "Open / Fund", detail: "管理者开池，活动资金进入池子", icon: Landmark },
  { label: "Evidence", detail: "贡献者提交贡献证据", icon: ReceiptText },
  { label: "Review", detail: "AI 评分，高风险进 Cobo App", icon: BrainCircuit },
  { label: "Record", detail: "CAW 写入链上贡献分", icon: FileSignature },
  { label: "Finalize", detail: "管理者关闭活动并锁定分账", icon: ShieldCheck },
  { label: "Claim", detail: "贡献者 gasless 领取收益", icon: WalletCards },
] satisfies { label: string; detail: string; icon: LucideIcon }[];

const coboPath = [
  { title: "Cobo App 高风险审批", desc: "高分、高频、累计风险或低置信度不会直接进入资金分配。", icon: Scale },
  { title: "Cobo Sign Pact 签名", desc: "审批通过后才签 EIP-712 贡献证明。", icon: FileSignature },
  { title: "CAW 代执行上链", desc: "CAW 代执行记分和领取交易，保留 Cobo 审计链。", icon: Workflow },
];

const heroRoleCtaClass =
  "inline-flex min-h-12 min-w-[168px] items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[rgba(255,253,247,0.94)] px-5 py-2.5 text-sm font-semibold text-[var(--ink-soft)] no-underline shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--role-color)] hover:bg-[var(--role-soft)] hover:text-[var(--role-ink)] hover:no-underline";

export default function RoleEntryPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <nav className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgba(251,250,247,0.92)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-[var(--font-display)] text-xl font-bold text-[var(--ink)] no-underline hover:text-[var(--project)] hover:no-underline">
              CGHub
            </Link>
            <span className="hidden rounded-full border border-[var(--line)] bg-[var(--paper-soft)] px-3.5 py-1.5 text-[0.82rem] font-medium text-[var(--muted)] sm:inline-flex">
              活动结算系统
            </span>
          </div>
          <div className="hidden items-center gap-7 text-sm font-medium text-[var(--muted)] md:flex">
            <a href="#flow" className="text-[var(--muted)] no-underline hover:text-[var(--ink)] hover:no-underline">
              流程
            </a>
            <a href="#cobo" className="text-[var(--muted)] no-underline hover:text-[var(--ink)] hover:no-underline">
              Cobo
            </a>
            <a href="#roles" className="text-[var(--muted)] no-underline hover:text-[var(--ink)] hover:no-underline">
              角色
            </a>
          </div>
          <Link
            href="#roles"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-3.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] no-underline shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--project)] hover:bg-[var(--project-soft)] hover:text-[var(--role-ink)] hover:no-underline"
          >
            选择角色
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </nav>

      <section className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-8 md:px-8 md:pb-20 md:pt-10">
        <section
          className="relative mx-auto grid min-h-[520px] max-w-[990px] place-items-center overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--paper)] px-6 py-16 text-center shadow-[var(--shadow)] md:px-12 md:py-20"
          aria-labelledby="role-entry-title"
        >
          <div className="absolute inset-0 opacity-[0.58] [background-image:linear-gradient(rgba(185,170,147,.34)_1px,transparent_1px),linear-gradient(90deg,rgba(185,170,147,.28)_1px,transparent_1px)] [background-size:36px_36px]" />
          <div className="absolute inset-x-10 top-0 h-1 bg-gradient-to-r from-[var(--project)] via-[var(--contributor)] to-[var(--manager)] opacity-80" />
          <div className="relative z-10 mx-auto grid max-w-3xl justify-items-center gap-6">
            <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper-soft)] px-3.5 py-1.5 text-[0.86rem] font-medium text-[var(--ink-soft)]">
              <Bot size={13} aria-hidden />
              Cobo 审批与代执行
            </span>

            <div className="grid gap-4">
              <h1
                id="role-entry-title"
                className="m-0 text-balance font-[var(--font-display)] text-4xl font-bold leading-[1.04] text-[var(--ink)] md:text-6xl"
              >
                让资金按真实贡献分配的系统
              </h1>
              <p className="m-0 mx-auto max-w-2xl text-base leading-7 text-[var(--ink-soft)] md:text-lg">
                CGHub 让管理者创建活动资金池，项目方注资、用户付费或其他活动收入进入池子；贡献者提交证据，AI 按 rubric 评分，高风险结果进入 Cobo App 审批，活动关闭后支持 gasless claim。
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/project"
                className={cn("role-project", heroRoleCtaClass)}
              >
                <span className="h-2 w-2 rounded-full bg-[var(--role-color)]" aria-hidden />
                查看活动资金池
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link
                href="/contributor"
                className={cn("role-contributor", heroRoleCtaClass)}
              >
                <span className="h-2 w-2 rounded-full bg-[var(--role-color)]" aria-hidden />
                提交贡献证据
                <ArrowRight size={16} aria-hidden />
              </Link>
              <Link
                href="/manager"
                className={cn("role-manager", heroRoleCtaClass)}
              >
                <span className="h-2 w-2 rounded-full bg-[var(--role-color)]" aria-hidden />
                管理活动结算
                <ArrowRight size={16} aria-hidden />
              </Link>
            </div>

            <div className="mt-4 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
              <span className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-4 text-[0.92rem] font-medium text-[var(--dim)]">
                open pool -&gt; fund -&gt; evidence
              </span>
              <span className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-soft)] px-4 text-[0.92rem] font-medium text-[var(--dim)]">
                review -&gt; record -&gt; finalize -&gt; claim
              </span>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-10 flex max-w-[880px] flex-wrap justify-center gap-x-9 gap-y-3 text-[0.96rem] font-medium text-[var(--dim)]">
          {capabilityTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>

      <section id="flow" className="mx-auto grid w-full max-w-[1180px] gap-8 px-4 py-14 md:px-8 md:py-20">
        <div className="mx-auto grid max-w-3xl justify-items-center gap-3 text-center">
          <span className="font-[var(--font-mono)] text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--dim)]">
            The settlement path
          </span>
          <h2 className="m-0 font-[var(--font-display)] text-3xl leading-tight text-[var(--ink)] md:text-5xl">
            从资金到领取，只保留必要步骤
          </h2>
          <p className="m-0 max-w-2xl text-base leading-7 text-[var(--muted)]">
            项目方、贡献者和管理者各自完成自己的动作，Cobo 负责审批、签名、执行和审计。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {flowSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article
                key={step.label}
                className="grid min-h-[170px] content-between gap-5 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper)] p-5 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--project)_30%,var(--line))] bg-[var(--project-soft)] text-[var(--project)]">
                    <Icon size={19} aria-hidden />
                  </span>
                  <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--dim)]">
                    0{index + 1}
                  </span>
                </div>
                <div className="grid gap-1">
                  <strong className="font-[var(--font-display)] text-2xl leading-tight text-[var(--ink)]">{step.label}</strong>
                  <p className="m-0 text-sm leading-6 text-[var(--muted)]">{step.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="cobo" className="mx-auto grid w-full max-w-[1180px] gap-14 border-t border-[var(--line)] px-4 py-16 md:px-8 md:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.82fr)] lg:items-center">
          <div className="grid gap-5">
            <span className="inline-flex w-max items-center rounded-full border border-[var(--line)] bg-[var(--paper-soft)] px-3 py-1 font-[var(--font-mono)] text-[0.68rem] font-extrabold uppercase text-[var(--dim)]">
              Cobo control layer
            </span>
            <h2 className="m-0 max-w-2xl font-[var(--font-display)] text-3xl leading-tight text-[var(--ink)] md:text-5xl">
              关键结算动作，由 Cobo 留下审批和执行记录
            </h2>
            <ul className="m-0 grid gap-3 p-0 text-base leading-7 text-[var(--ink-soft)]">
              <li>项目方资金池决定可分配总额，贡献评分决定每个人的分配比例。</li>
              <li>评分会影响资金分配，风险评分必须先经过 Cobo App 审批。</li>
              <li>Cobo approve 后才出现可用签名，CAW 再把贡献分数写到链上。</li>
              <li>领取阶段不重复人工审核，由 Cobo 代付执行确定金额的 claimFor。</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/replay"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--project)_30%,var(--line))] bg-[var(--project-soft)] px-4 py-2 text-sm font-extrabold text-[var(--project)] no-underline hover:no-underline"
              >
                查看审计回放
                <ArrowRight size={15} aria-hidden />
              </Link>
              <Link
                href="/manager"
                className="role-manager inline-flex min-h-10 items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--role-color)_30%,var(--line))] bg-[var(--role-soft)] px-4 py-2 text-sm font-extrabold text-[var(--role-ink)] no-underline hover:no-underline"
              >
                管理结算
                <ArrowRight size={15} aria-hidden />
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--paper)] p-5 shadow-[var(--shadow-soft)]">
            {coboPath.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="grid grid-cols-[44px_minmax(0,1fr)] gap-4 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper-soft)] p-4">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--manager)_30%,var(--line))] bg-[var(--manager-soft)] text-[var(--manager)]">
                    <Icon size={19} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <strong className="block text-sm font-extrabold text-[var(--ink)]">{item.title}</strong>
                    <p className="m-0 mt-1 text-sm leading-6 text-[var(--muted)]">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-soft)] p-5">
            <div className="mb-5 flex items-center justify-between border-b border-[var(--line)] pb-3 font-[var(--font-mono)] text-[0.7rem] font-extrabold uppercase text-[var(--dim)]">
              <span>仅后端处理</span>
              <span>缺少独立审批</span>
            </div>
            <pre className="font-[var(--font-mono)] text-sm leading-7 text-[var(--dim)]">
{`score = await agent.score(evidence)
signature = backend.sign(score)
pool.recordContribution(score)

// score changes allocation directly`}
            </pre>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--contributor)_26%,var(--line))] bg-[color-mix(in_srgb,var(--contributor-soft)_62%,var(--paper))] p-5">
            <div className="mb-5 flex items-center justify-between border-b border-[color-mix(in_srgb,var(--contributor)_22%,var(--line))] pb-3 font-[var(--font-mono)] text-[0.7rem] font-extrabold uppercase text-[var(--contributor)]">
              <span>CGHub + Cobo</span>
              <span>审批后执行</span>
            </div>
            <pre className="font-[var(--font-mono)] text-sm leading-7 text-[var(--ink-soft)]">
{`review = await cobo.requestApproval(risk)
proof = await cobo.signTypedData(review)
caw.recordContributionBySig(proof)

// approval before allocation`}
            </pre>
          </div>
        </div>
      </section>

      <section id="roles" className="mx-auto grid w-full max-w-[1180px] gap-8 border-t border-[var(--line)] px-4 py-16 md:px-8 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="grid gap-3">
            <span className="font-[var(--font-mono)] text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--dim)]">
              Choose workspace
            </span>
            <h2 className="m-0 font-[var(--font-display)] text-3xl leading-tight text-[var(--ink)] md:text-5xl">
              三个入口，各做一件事
            </h2>
          </div>
          <p className="m-0 max-w-xl text-base leading-7 text-[var(--muted)]">
            项目方、贡献者和管理者分别进入自己的工作台；每个页面只展示当前角色需要处理的资金、贡献或管理动作。
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {ENTRY_INTENT_OPTIONS.map((option) => {
            const detail = roleDetails[option.intent];
            const Icon = detail.icon;
            return (
              <Link
                key={option.intent}
                className={cn(
                  `role-${option.intent}`,
                  "group grid min-h-[290px] content-between gap-6 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper)] p-6 text-[var(--ink)] no-underline shadow-[var(--shadow-soft)] transition hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--role-color)_52%,var(--line))] hover:no-underline"
                )}
                href={option.defaultHref}
              >
                <div className="grid gap-5">
                  <div className="flex items-start justify-between gap-4">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--role-color)_35%,var(--line))] bg-[var(--role-soft)] text-[var(--role-ink)]">
                      <Icon size={20} aria-hidden />
                    </span>
                    <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--dim)]">
                      {detail.index} / {detail.accent}
                    </span>
                  </div>

                  <div className="grid gap-2">
                    <span className="text-sm font-extrabold text-[var(--role-ink)]">{option.audience}</span>
                    <strong className="font-[var(--font-display)] text-3xl leading-tight text-[var(--ink)]">
                      {option.label}
                    </strong>
                    <p className="m-0 text-sm leading-6 text-[var(--muted)]">{detail.summary}</p>
                  </div>

                  <ul className="grid gap-2 p-0 text-sm font-bold text-[var(--ink-soft)]">
                    {detail.steps.map((step) => (
                      <li key={step} className="flex items-center gap-2">
                        <BadgeCheck size={15} aria-hidden className="text-[var(--role-color)]" />
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>

                <span className={cn(roleButtonClass({ variant: "primary", size: "md" }), "w-full justify-between")}>
                  {detail.cta}
                  <ArrowRight size={16} aria-hidden className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-[var(--line)] px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 font-[var(--font-mono)] text-xs font-extrabold text-[var(--dim)]">
          <span>CGHub Ledger</span>
          <span className="inline-flex items-center gap-2">
            <Code2 size={14} aria-hidden />
            AI scoring · Cobo approval · On-chain settlement
          </span>
          <span className="inline-flex items-center gap-2">
            <GitBranch size={14} aria-hidden />
            On-chain settlement path
          </span>
        </div>
      </footer>
    </main>
  );
}
