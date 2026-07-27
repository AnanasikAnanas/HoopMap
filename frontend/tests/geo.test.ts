import { describe, expect, it } from "vitest";
import { distanceMeters } from "@/lib/geo";

describe("distanceMeters", () => {
  it("returns zero for the same point", () => {
    expect(
      distanceMeters(
        { lat: 53.5078, lon: 49.4204 },
        { lat: 53.5078, lon: 49.4204 },
      ),
    ).toBe(0);
  });

  it("calculates a realistic distance between nearby points", () => {
    const distance = distanceMeters(
      { lat: 53.5078, lon: 49.4204 },
      { lat: 53.5178, lon: 49.4204 },
    );

    expect(distance).toBeGreaterThan(1_100);
    expect(distance).toBeLessThan(1_120);
  });
});
