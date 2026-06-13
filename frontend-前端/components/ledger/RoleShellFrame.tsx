import Link from "next/link";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { Landmark, ShieldCheck, Sprout, Wallet } from "lucide-react";
import { cn } from "../../lib/utils";
import { LedgerNotice } from "./LedgerNotice";

type RoleKind = "project" | "contributor" | "manager";

interface WalletState {
  address: string | null;
  shortAddress: string;
  chainId: number | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connectWallet: () => Promise<string | null | undefined>;
  disconnect: () => void;
}

interface NavItem {
  href: string;
  label: string;
}

interface RoleShellFrameProps {
  role: RoleKind;
  brand: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  scopeTitle: string;
  scopeDescription: string;
  navItems: NavItem[];
  wallet: WalletState;
  children: ReactNode;
}

const roleIcon = {
  project: Landmark,
  contributor: Sprout,
  manager: ShieldCheck,
};

export function RoleShellFrame({
  role,
  brand,
  title,
  subtitle,
  eyebrow,
  scopeTitle,
  scopeDescription,
  navItems,
  wallet,
  children,
}: RoleShellFrameProps) {
  const router = useRouter();
  const Icon = roleIcon[role];

  return (
    <main className={cn(`role-${role}`, "min-h-screen lg:grid lg:grid-cols-[244px_minmax(0,1fr)]")}>
      <aside className="border-b border-[var(--line)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--role-soft)_60%,transparent),transparent_320px),var(--paper)] p-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:p-5">
        <div className="grid gap-4 lg:h-full">
          <Link
            className="grid gap-1 border-b border-[var(--line)] pb-4 text-[var(--ink)] no-underline hover:no-underline"
            href="/"
          >
            <span className="font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">CGHub</span>
            <strong className="flex items-center gap-2 font-[var(--font-display)] text-2xl leading-tight text-[var(--role-ink)]">
              <Icon size={22} aria-hidden />
              {brand}
            </strong>
          </Link>

          <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1" aria-label={`${brand}工作台`}>
            {navItems.map((item) => {
              const active = router.asPath === item.href || router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-10 items-center rounded-[var(--radius-sm)] border px-3 py-2 font-extrabold no-underline transition hover:no-underline",
                    active
                      ? "border-[color-mix(in_srgb,var(--role-color)_36%,var(--line))] bg-[var(--role-soft)] text-[var(--role-ink)]"
                      : "border-transparent text-[var(--ink-soft)] hover:border-[color-mix(in_srgb,var(--role-color)_28%,var(--line))] hover:bg-[var(--role-soft)]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--role-color)_22%,var(--line))] bg-[color-mix(in_srgb,var(--role-soft)_62%,var(--paper))] p-4">
            <span className="block font-[var(--font-mono)] text-xs font-extrabold text-[var(--muted)]">当前视角</span>
            <strong className="mt-1.5 block font-[var(--font-display)] text-xl leading-tight text-[var(--role-ink)]">
              {scopeTitle}
            </strong>
            <p className="mt-2 text-sm text-[var(--muted)]">{scopeDescription}</p>
          </div>
        </div>
      </aside>

      <section className="min-w-0 px-4 pb-14 pt-5 md:px-7 lg:w-full lg:max-w-[1180px] lg:px-8">
        <header className="mb-6 grid gap-4 border-b border-[var(--line)] pb-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div>
            <span className="inline-flex min-h-6 items-center rounded-full border border-[color-mix(in_srgb,var(--role-color)_35%,var(--line))] bg-[var(--role-soft)] px-2.5 py-1 font-[var(--font-mono)] text-xs font-extrabold text-[var(--role-ink)]">
              {eyebrow}
            </span>
            <h1 className="mt-3 max-w-4xl font-[var(--font-display)] text-3xl leading-tight text-[var(--ink)] md:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--ink-soft)] md:text-base">{subtitle}</p>
          </div>
          <WalletButton wallet={wallet} />
        </header>
        {wallet.error && <LedgerNotice tone="error">{wallet.error}</LedgerNotice>}
        {children}
      </section>
    </main>
  );
}

function WalletButton({ wallet }: { wallet: WalletState }) {
  return (
    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper)] px-2.5 py-2 font-[var(--font-mono)] text-xs text-[var(--muted)]">
        <Wallet size={14} aria-hidden />
        {wallet.chainId === 11155111 ? "Sepolia" : wallet.chainId ? `链 ${wallet.chainId}` : "未连接网络"}
      </span>
      {wallet.isConnected ? (
        <button
          className="inline-flex min-h-9 items-center rounded-[var(--radius-sm)] border border-[var(--role-color)] bg-[var(--role-color)] px-2.5 py-2 font-[var(--font-mono)] text-xs font-extrabold text-white"
          onClick={wallet.disconnect}
        >
          {wallet.shortAddress || "已连接"}
        </button>
      ) : (
        <button
          className="inline-flex min-h-9 items-center rounded-[var(--radius-sm)] border border-[var(--role-color)] bg-[var(--role-color)] px-2.5 py-2 font-[var(--font-mono)] text-xs font-extrabold text-white disabled:border-[var(--line)] disabled:bg-[var(--paper-soft)] disabled:text-[var(--dim)]"
          onClick={wallet.connectWallet}
          disabled={wallet.isLoading}
        >
          {wallet.isLoading ? "连接中..." : "连接钱包"}
        </button>
      )}
    </div>
  );
}
