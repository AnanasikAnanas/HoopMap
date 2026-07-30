import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveGameStatus } from "@/lib/supabase/serializers";

describe("effective game status", () => {
  afterEach(() => vi.useRealTimers());

  it("derives live and finished states without changing cancelled games", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-08-10T17:00:00.000Z"));

    expect(
      effectiveGameStatus({
        status: "scheduled",
        starts_at: "2030-08-10T16:00:00.000Z",
        ends_at: "2030-08-10T18:00:00.000Z",
      }),
    ).toBe("in_progress");
    expect(
      effectiveGameStatus({
        status: "scheduled",
        starts_at: "2030-08-10T14:00:00.000Z",
        ends_at: "2030-08-10T15:00:00.000Z",
      }),
    ).toBe("finished");
    expect(
      effectiveGameStatus({
        status: "cancelled",
        starts_at: "2030-08-10T14:00:00.000Z",
        ends_at: "2030-08-10T15:00:00.000Z",
      }),
    ).toBe("cancelled");
  });
});
