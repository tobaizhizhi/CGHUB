import type { ReactNode } from "react";
import type { useWallet } from "../hooks/useWallet";
import { RoleShellFrame } from "./ledger/RoleShellFrame";

type WalletState = ReturnType<typeof useWallet>;

interface ContributorShellProps {
  title: string;
  subtitle: string;
  wallet: WalletState;
  children: ReactNode;
}

const navItems = [
  { href: "/contributor", label: "可参与活动" },
  { href: "/contributor#ended", label: "已结束" },
  { href: "/contributor#portfolio", label: "我的收益" },
];

export function ContributorShell({ title, subtitle, wallet, children }: ContributorShellProps) {
  return (
    <RoleShellFrame
      role="contributor"
      brand="贡献者"
      title={title}
      subtitle={subtitle}
      eyebrow="贡献者工作台"
      scopeTitle="贡献收益档案"
      scopeDescription="提交贡献记录，查看自己的分数、待领取和已领取收益。"
      navItems={navItems}
      wallet={wallet}
    >
      {children}
    </RoleShellFrame>
  );
}
