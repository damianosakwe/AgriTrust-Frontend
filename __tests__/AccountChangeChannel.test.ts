import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import EventEmitter from "eventemitter3";

const ACCOUNT_SWITCH = "ACCOUNT_SWITCH";

class AccountChangeChannel extends EventEmitter {
  private pendingAccount: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceWindow = 50;

  push(account: string | null): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.pendingAccount = account;
    this.debounceTimer = setTimeout(() => {
      this.emit(ACCOUNT_SWITCH, this.pendingAccount);
      this.pendingAccount = null;
      this.debounceTimer = null;
    }, this.debounceWindow);
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.removeAllListeners();
  }
}

describe("AccountChangeChannel", () => {
  let channel: AccountChangeChannel;

  beforeEach(() => {
    vi.useFakeTimers();
    channel = new AccountChangeChannel();
  });

  afterEach(() => {
    channel.destroy();
    vi.useRealTimers();
  });

  it("deduplicates rapid account changes within 50ms window", () => {
    const handler = vi.fn();
    channel.on(ACCOUNT_SWITCH, handler);

    channel.push("0x123");
    channel.push("0x456");
    channel.push("0x789");

    vi.advanceTimersByTime(60);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("0x789");
  });

  it("handles 5 rapid account changes within 500ms without data corruption", () => {
    const handler = vi.fn();
    channel.on(ACCOUNT_SWITCH, handler);

    channel.push("0xaaa");
    vi.advanceTimersByTime(10);
    channel.push("0xbbb");
    vi.advanceTimersByTime(10);
    channel.push("0xccc");
    vi.advanceTimersByTime(10);
    channel.push("0xddd");
    vi.advanceTimersByTime(10);
    channel.push("0xeee");
    vi.advanceTimersByTime(10);

    vi.advanceTimersByTime(60);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("0xeee");
  });

  it("emits separate events when pushes are spaced beyond debounce window", () => {
    const handler = vi.fn();
    channel.on(ACCOUNT_SWITCH, handler);

    channel.push("0x111");
    vi.advanceTimersByTime(60);

    channel.push("0x222");
    vi.advanceTimersByTime(60);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, "0x111");
    expect(handler).toHaveBeenNthCalledWith(2, "0x222");
  });

  it("emits null when account disconnects", () => {
    const handler = vi.fn();
    channel.on(ACCOUNT_SWITCH, handler);

    channel.push(null);
    vi.advanceTimersByTime(60);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(null);
  });

  it("clears pending on destroy", () => {
    const handler = vi.fn();
    channel.on(ACCOUNT_SWITCH, handler);

    channel.push("0xwillbecancelled");
    channel.destroy();
    vi.advanceTimersByTime(60);

    expect(handler).not.toHaveBeenCalled();
  });
});

describe("queryClient integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("simulates 5 rapid account changes asserting queryClient.clear is called exactly once", () => {
    const queryClientMock = {
      clear: vi.fn(),
      resetQueries: vi.fn(),
      invalidateQueries: vi.fn(),
    };

    const handler = vi.fn((newAccount: string | null) => {
      if (!newAccount) {
        queryClientMock.clear();
      } else {
        queryClientMock.resetQueries();
        queryClientMock.invalidateQueries();
      }
    });

    const channel = new AccountChangeChannel();
    channel.on(ACCOUNT_SWITCH, handler);

    channel.push("0x111");
    channel.push("0x222");
    channel.push("0x333");
    channel.push("0x444");
    channel.push(null);

    vi.advanceTimersByTime(60);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(null);
    expect(queryClientMock.clear).toHaveBeenCalledTimes(1);
    expect(queryClientMock.resetQueries).not.toHaveBeenCalled();
    expect(queryClientMock.invalidateQueries).not.toHaveBeenCalled();

    channel.destroy();
  });

  it("calls queryClient methods correctly on account switch (non-null)", () => {
    const queryClientMock = {
      clear: vi.fn(),
      resetQueries: vi.fn(),
      invalidateQueries: vi.fn(),
    };

    const handler = vi.fn((newAccount: string | null) => {
      if (!newAccount) {
        queryClientMock.clear();
      } else {
        queryClientMock.resetQueries();
        queryClientMock.invalidateQueries();
      }
    });

    const channel = new AccountChangeChannel();
    channel.on(ACCOUNT_SWITCH, handler);

    channel.push("0xabc");
    vi.advanceTimersByTime(60);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("0xabc");
    expect(queryClientMock.resetQueries).toHaveBeenCalledTimes(1);
    expect(queryClientMock.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClientMock.clear).not.toHaveBeenCalled();

    channel.destroy();
  });
});
