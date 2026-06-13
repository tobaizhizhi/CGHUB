import { useRouter } from "next/router";
import { useEffect } from "react";
import Link from "next/link";
import { LedgerPanel } from "../components/ledger/LedgerPanel";
import { roleButtonClass } from "../components/ledger/RoleButton";

export default function Dashboard() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/replay");
  }, [router]);

  return (
    <main className="role-manager grid min-h-screen place-items-center px-4 py-10">
      <LedgerPanel className="w-full max-w-xl">
        <span className="role-kicker">页面迁移</span>
        <h1 className="mt-2 font-[var(--font-display)] text-3xl leading-tight text-[var(--ink)]">正在进入复盘页</h1>
        <p className="mt-3 text-[var(--muted)]">复盘页已迁移到 /replay。</p>
        <Link href="/replay" className={roleButtonClass({ variant: "secondary" })}>
          打开复盘页
        </Link>
      </LedgerPanel>
    </main>
  );
}
