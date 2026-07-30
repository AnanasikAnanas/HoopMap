import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("HOOPMAP PWA", () => {
  it("provides an installable manifest with regular and maskable icons", () => {
    const value = manifest();

    expect(value.name).toContain("HOOPMAP");
    expect(value.start_url).toContain("/map");
    expect(value.display).toBe("standalone");
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ]),
    );
  });

  it("limits offline behavior to navigation fallback", () => {
    const worker = readFileSync("public/sw.js", "utf8");

    expect(worker).toContain('event.request.mode !== "navigate"');
    expect(worker).toContain('self.addEventListener("push"');
    expect(worker).toContain('self.addEventListener("notificationclick"');
    expect(worker).not.toContain("caches.put(event.request");
  });
});
