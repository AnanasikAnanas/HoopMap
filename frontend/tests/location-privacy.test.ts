import { describe, expect, it } from "vitest";
import { approximateMapLocation } from "@/lib/location-privacy";

describe("map location privacy", () => {
  it("keeps only an approximately one-kilometer location", () => {
    expect(
      approximateMapLocation({ lat: 53.518812, lon: 49.234417 }),
    ).toEqual({
      lat: 53.52,
      lon: 49.23,
    });
  });

  it("rejects invalid coordinates", () => {
    expect(() =>
      approximateMapLocation({ lat: 95, lon: 49.2 }),
    ).toThrow("out of range");
  });
});
