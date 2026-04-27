import { describe, it, expect } from "vitest";
import { formatAsMarkdown, formatAsPlainList } from "../src/formatter";
import type { RackInfo } from "../src/types";

const sampleRack: RackInfo = {
  id: "3116603",
  name: "Intellijel Stealth",
  username: "dangayle",
  modules: [
    {
      id: "4599",
      name: "Triplatt",
      vendor: "Intellijel",
      slug: "intellijel-triplatt",
      hp: 6,
      description: "Triple attenuverter",
      priceEur: 97,
      priceUsd: 109,
      row: 1,
      col: 41,
    },
    {
      id: "25678",
      name: "Zadar (black panel)",
      vendor: "Xaoc Devices",
      slug: "xaoc-devices-zadar-black-panel",
      hp: 10,
      description: "Quad envelope generator",
      priceEur: 35,
      priceUsd: 39,
      row: 1,
      col: 47,
    },
    {
      id: "30517",
      name: "Ikarie",
      vendor: "Bastl Instruments",
      slug: "bastl-instruments-ikarie",
      hp: 8,
      description: "Stereo / dual peak filter",
      priceEur: 318,
      priceUsd: 299,
      row: 3,
      col: 75,
    },
  ],
};

describe("formatAsMarkdown", () => {
  it("produces a markdown list with vendor and name", () => {
    const result = formatAsMarkdown(sampleRack);
    expect(result).toContain("- Intellijel Triplatt");
    expect(result).toContain("- Xaoc Devices Zadar (black panel)");
    expect(result).toContain("- Bastl Instruments Ikarie");
  });

  it("includes HP in parentheses", () => {
    const result = formatAsMarkdown(sampleRack);
    expect(result).toContain("(6hp)");
    expect(result).toContain("(10hp)");
    expect(result).toContain("(8hp)");
  });

  it("does not include price by default", () => {
    const result = formatAsMarkdown(sampleRack);
    expect(result).not.toContain("$");
    expect(result).not.toContain("€");
  });

  it("includes price when includePrice is true", () => {
    const result = formatAsMarkdown(sampleRack, { includePrice: true });
    expect(result).toContain("- Intellijel Triplatt (6hp) — €97 / $109");
    expect(result).toContain("- Bastl Instruments Ikarie (8hp) — €318 / $299");
  });

  it("shows only available price when one is null", () => {
    const rack: RackInfo = {
      ...sampleRack,
      modules: [
        { ...sampleRack.modules[0], priceEur: 97, priceUsd: null },
      ],
    };
    const result = formatAsMarkdown(rack, { includePrice: true });
    expect(result).toContain("— €97");
    expect(result).not.toContain("$");
  });

  it("omits price suffix when both prices are null", () => {
    const rack: RackInfo = {
      ...sampleRack,
      modules: [
        { ...sampleRack.modules[0], priceEur: null, priceUsd: null },
      ],
    };
    const result = formatAsMarkdown(rack, { includePrice: true });
    expect(result).toContain("- Intellijel Triplatt (6hp)");
    // The line should NOT have a price suffix (" — €...") 
    const line = result.split("\n").find(l => l.startsWith("- Intellijel Triplatt"))!;
    expect(line).not.toContain(" — €");
    expect(line).not.toContain(" — $");
  });

  it("includes a header with rack name", () => {
    const result = formatAsMarkdown(sampleRack);
    expect(result).toMatch(/^## Intellijel Stealth/m);
  });

  it("includes module count", () => {
    const result = formatAsMarkdown(sampleRack);
    expect(result).toContain("3 modules");
  });

  it("handles empty module list", () => {
    const emptyRack: RackInfo = { ...sampleRack, modules: [] };
    const result = formatAsMarkdown(emptyRack);
    expect(result).toContain("0 modules");
  });
});

describe("formatAsPlainList", () => {
  it("produces a simple newline-separated list", () => {
    const result = formatAsPlainList(sampleRack);
    const lines = result.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Intellijel Triplatt");
    expect(lines[1]).toBe("Xaoc Devices Zadar (black panel)");
    expect(lines[2]).toBe("Bastl Instruments Ikarie");
  });

  it("includes price when includePrice is true", () => {
    const result = formatAsPlainList(sampleRack, { includePrice: true });
    const lines = result.trim().split("\n");
    expect(lines[0]).toBe("Intellijel Triplatt — €97 / $109");
  });

  it("handles empty module list", () => {
    const emptyRack: RackInfo = { ...sampleRack, modules: [] };
    const result = formatAsPlainList(emptyRack);
    expect(result).toBe("");
  });
});
