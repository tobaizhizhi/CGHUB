export const WALLET_AUTOCONNECT_KEY = "cghub.wallet.autoconnect";

export function shouldRestoreWallet(accounts: readonly string[], storedPreference: string | null | undefined) {
  return storedPreference === "1" && accounts.length > 0;
}

export function normalizeWalletAccount(accounts: readonly string[]) {
  return accounts[0] ?? null;
}

export function persistWalletConnection(storage: Pick<Storage, "setItem">) {
  storage.setItem(WALLET_AUTOCONNECT_KEY, "1");
}

export function clearWalletConnection(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(WALLET_AUTOCONNECT_KEY);
}
