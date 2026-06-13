import type { ReactNode } from "react";
import type { useWallet } from "../hooks/useWallet";
import { RoleShellFrame } from "./ledger/RoleShellFrame";

type WalletState = ReturnType<typeof useWallet>;

interface ManagerShellProps {
  title: string;
  subtitle: string;
  wallet: WalletState;
  children: ReactNode;
}

const navItems = [
  { href: "/manager", label: "管理总控" },
  { href: "/manager/activities/new", label: "创建活动" },
];

export function ManagerShell({ title, subtitle, wallet, children }: ManagerShellProps) {
  return (
    <RoleShellFrame
      role="manager"
      brand="管理者"
      title={title}
      subtitle={subtitle}
      eyebrow="管理者工作台"
      scopeTitle="活动生命周期台"
      scopeDescription="创建活动、开资金池、结束活动，维护 projectId / roundId 绑定。"
      navItems={navItems}
      wallet={wallet}
    >
      {children}
    </RoleShellFrame>
  );
}
