import { beforeEach, describe, expect, it, vi } from "vitest";

describe("API session security", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps tokens out of browser storage and includes credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access: "short-lived-access",
          user: {
            id: 1,
            telegram_id: 42,
            username: "player",
            first_name: "Player",
            last_name: "",
            avatar_url: "",
            role: "user",
            reputation: 0,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { telegramLogin } = await import("@/lib/api");

    await telegramLogin("signed-init-data");

    expect(localStorage.length).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/telegram/"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("restores access through the refresh cookie endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access: "restored-access" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { restoreSession } = await import("@/lib/api");

    await expect(restoreSession()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh/"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });
});
