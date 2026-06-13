import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearWalletConnection,
  normalizeWalletAccount,
  persistWalletConnection,
  shouldRestoreWallet,
  WALLET_AUTOCONNECT_KEY,
} from "../lib/wallet-core";

describe("wallet persistence", () => {
  it("restores an authorized wallet only when the app connection preference is enabled", () => {
    assert.equal(shouldRestoreWallet(["0x1111111111111111111111111111111111111111"], "1"), true);
    assert.equal(shouldRestoreWallet(["0x1111111111111111111111111111111111111111"], null), false);
    assert.equal(shouldRestoreWallet([], "1"), false);
  });

  it("persists and clears the app-level reconnect preference", () => {
    const writes: Record<string, string> = {};
    const storage = {
      setItem(key: string, value: string) {
        writes[key] = value;
      },
      removeItem(key: string) {
        delete writes[key];
      },
    };

    persistWalletConnection(storage);
    assert.equal(writes[WALLET_AUTOCONNECT_KEY], "1");

    clearWalletConnection(storage);
    assert.equal(writes[WALLET_AUTOCONNECT_KEY], undefined);
  });

  it("uses the first EIP-1193 account as the active account", () => {
    assert.equal(
      normalizeWalletAccount([
        "0x2222222222222222222222222222222222222222",
        "0x3333333333333333333333333333333333333333",
      ]),
      "0x2222222222222222222222222222222222222222"
    );
    assert.equal(normalizeWalletAccount([]), null);
  });
});
