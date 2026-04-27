import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRackHtml, extractRackUrl } from "../src/parser";

const fixture = readFileSync(
  join(__dirname, "fixtures/rack-3116603.html"),
  "utf-8"
);

describe("extractRackUrl", () => {
  it("extracts rack ID from standard URL", () => {
    expect(extractRackUrl("https://modulargrid.net/e/racks/view/3116603")).toBe(
      "3116603"
    );
  });

  it("extracts rack ID from www URL", () => {
    expect(
      extractRackUrl("https://www.modulargrid.net/e/racks/view/3116603")
    ).toBe("3116603");
  });

  it("extracts rack ID from URL with trailing slash", () => {
    expect(
      extractRackUrl("https://modulargrid.net/e/racks/view/3116603/")
    ).toBe("3116603");
  });

  it("returns null for invalid URL", () => {
    expect(extractRackUrl("https://example.com")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractRackUrl("")).toBeNull();
  });

  it("returns null for non-rack modulargrid URL", () => {
    expect(
      extractRackUrl("https://modulargrid.net/e/modules/browser")
    ).toBeNull();
  });
});

describe("parseRackHtml", () => {
  it("extracts rack info from HTML", () => {
    const result = parseRackHtml(fixture);
    expect(result.id).toBe("3116603");
    expect(result.name).toBe("Intellijel Stealth");
    expect(result.username).toBe("dangayle");
  });

  it("extracts all modules", () => {
    const result = parseRackHtml(fixture);
    expect(result.modules).toHaveLength(3);
  });

  it("parses module fields correctly", () => {
    const result = parseRackHtml(fixture);
    // After sorting by vendor/name, Bastl Instruments Ikarie should be first
    const first = result.modules[0];
    expect(first.name).toBe("Ikarie");
    expect(first.vendor).toBe("Bastl Instruments");
    expect(first.slug).toBe("bastl-instruments-ikarie");
    expect(first.hp).toBe(8);
    expect(first.priceEur).toBe(318);
    expect(first.priceUsd).toBe(299);
  });

  it("handles price_base dash as valid price", () => {
    const result = parseRackHtml(fixture);
    // Ikarie has price_base: "-" but still has numeric prices
    const ikarie = result.modules.find((m) => m.name === "Ikarie")!;
    expect(ikarie.priceEur).toBe(318);
    expect(ikarie.priceUsd).toBe(299);
  });

  it("throws on HTML without rack data", () => {
    expect(() => parseRackHtml("<html><body></body></html>")).toThrow(
      "No rack data found"
    );
  });

  it("throws on malformed JSON", () => {
    const badHtml = `<script type="application/json" data-mg-json="rtd">{invalid</script>`;
    expect(() => parseRackHtml(badHtml)).toThrow();
  });

  it("sorts modules by vendor then name", () => {
    const result = parseRackHtml(fixture);
    for (let i = 1; i < result.modules.length; i++) {
      const prev = result.modules[i - 1];
      const curr = result.modules[i];
      const cmp = prev.vendor.localeCompare(curr.vendor) || prev.name.localeCompare(curr.name);
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });
});

describe("parseRackHtml edge cases", () => {
  it("handles module with zero HP", () => {
    const html = makeFixture([
      {
        id: "1",
        name: "Blank",
        slug: "blank-panel",
        description: "",
        te: "0",
        price_eur: null,
        price_usd: null,
        price_base: null,
        is_passive: true,
        is_1u: false,
        vendor_id: "1",
        Vendor: { name: "Generic" },
        ModulesRack: { id: "1", rack_id: "1", module_id: "1", row: "1", col: "1", is_inbounds: true },
      },
    ]);
    const result = parseRackHtml(html);
    expect(result.modules[0].hp).toBe(0);
    expect(result.modules[0].priceEur).toBeNull();
    expect(result.modules[0].priceUsd).toBeNull();
  });

  it("handles numeric price_usd (not string)", () => {
    const html = makeFixture([
      {
        id: "2",
        name: "Test",
        slug: "test-mod",
        description: "test",
        te: "4",
        price_eur: "100",
        price_usd: 120,
        price_base: "eur",
        is_passive: false,
        is_1u: false,
        vendor_id: "2",
        Vendor: { name: "TestVendor" },
        ModulesRack: { id: "2", rack_id: "1", module_id: "2", row: "1", col: "5", is_inbounds: true },
      },
    ]);
    const result = parseRackHtml(html);
    expect(result.modules[0].priceUsd).toBe(120);
  });

  it("handles undefined price as null", () => {
    const html = makeFixture([
      {
        id: "4",
        name: "UndefinedPrice",
        slug: "undef-price",
        description: "",
        te: "4",
        price_eur: undefined,
        price_usd: undefined,
        price_base: null,
        is_passive: false,
        is_1u: false,
        vendor_id: "4",
        Vendor: { name: "Maker" },
        ModulesRack: { id: "4", rack_id: "1", module_id: "4", row: "1", col: "1", is_inbounds: true },
      },
    ]);
    const result = parseRackHtml(html);
    expect(result.modules[0].priceEur).toBeNull();
    expect(result.modules[0].priceUsd).toBeNull();
  });

  it("handles empty string price as null", () => {
    const html = makeFixture([
      {
        id: "3",
        name: "NoPriceModule",
        slug: "no-price",
        description: "",
        te: "4",
        price_eur: "",
        price_usd: "",
        price_base: null,
        is_passive: false,
        is_1u: false,
        vendor_id: "3",
        Vendor: { name: "Unknown" },
        ModulesRack: { id: "3", rack_id: "1", module_id: "3", row: "1", col: "1", is_inbounds: true },
      },
    ]);
    const result = parseRackHtml(html);
    expect(result.modules[0].priceEur).toBeNull();
    expect(result.modules[0].priceUsd).toBeNull();
  });
});

function makeFixture(modules: any[]): string {
  const data = {
    rack: {
      Rack: { id: "1", name: "Test Rack", rows: "3", te: "84", user_id: "1" },
      User: { id: "1", username: "testuser" },
      Patch: [],
      Module: modules,
    },
  };
  return `<script type="application/json" data-mg-json="rtd">${JSON.stringify(data)}</script>`;
}
