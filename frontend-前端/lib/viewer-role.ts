export type ViewerRole =
  | "visitor"
  | "auditor"
  | "projectOwner"
  | "contractOwner"
  | "funder"
  | "contributor";

export interface ViewerIdentityInput {
  walletAddress?: string | null;
  projectOwnerAddress?: string;
  contractOwnerAddress?: string;
  coboTreasuryAddress?: string;
  score?: string;
  pending?: string;
  claimed?: string;
  appearsInPoolEvents?: boolean;
}

export interface ViewerIdentity {
  primaryRole: ViewerRole;
  roles: ViewerRole[];
  label: string;
  warnings: string[];
}

export function deriveViewerIdentity(input: ViewerIdentityInput = {}): ViewerIdentity {
  if (!input.walletAddress) {
    return identity("visitor", ["visitor"], "访客视图");
  }

  const roles: ViewerRole[] = [];
  if (matchesAddress(input.walletAddress, input.contractOwnerAddress)) roles.push("contractOwner");
  if (matchesAddress(input.walletAddress, input.projectOwnerAddress)) roles.push("projectOwner");
  if (matchesAddress(input.walletAddress, input.coboTreasuryAddress)) roles.push("funder");
  if (hasContributorEvidence(input)) roles.push("contributor");

  if (roles.length === 0) {
    return identity("auditor", ["auditor"], "审计视图");
  }

  const primaryRole = roles[0];
  return identity(primaryRole, roles, roles.map(roleLabel).join(" + "));
}

function identity(primaryRole: ViewerRole, roles: ViewerRole[], label: string, warnings: string[] = []): ViewerIdentity {
  return { primaryRole, roles, label, warnings };
}

function matchesAddress(left?: string | null, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function hasContributorEvidence(input: ViewerIdentityInput) {
  return input.appearsInPoolEvents || hasPositiveValue(input.score) || hasPositiveValue(input.pending) || hasPositiveValue(input.claimed);
}

function hasPositiveValue(value?: string) {
  if (!value) return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function roleLabel(role: ViewerRole) {
  const labels: Record<ViewerRole, string> = {
    visitor: "访客",
    auditor: "审计",
    projectOwner: "项目方",
    contractOwner: "合约管理员",
    funder: "出资方",
    contributor: "贡献者",
  };
  return labels[role];
}
