import type { ReactNode } from "react";
import type { useWallet } from "../hooks/useWallet";
import { RoleShellFrame } from "./ledger/RoleShellFrame";

type WalletState = ReturnType<typeof useWallet>;

interface ProjectShellProps {
  title: string;
  subtitle: string;
  wallet: WalletState;
  children: ReactNode;
}

const navItems = [
  { href: "/project", label: "活动资金" },
  { href: "/project#funding", label: "待注资" },
  { href: "/project#settlement", label: "已结束" },
];

export function ProjectShell({ title, subtitle, wallet, children }: ProjectShellProps) {
  return (
    <RoleShellFrame
      role="project"
      brand="项目方"
      title={title}
      subtitle={subtitle}
      eyebrow="项目方 / 用户工作台"
      scopeTitle="活动资金台"
      scopeDescription="只处理活动查看、项目方注资和资金池状态。"
      navItems={navItems}
      wallet={wallet}
    >
      {children}
    </RoleShellFrame>
  );
}
