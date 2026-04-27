import type { RackInfo, RackModule, RawRackData, RawModuleData } from "./types";

/**
 * Extract rack ID from a ModularGrid rack URL.
 * Returns null if URL is not a valid rack URL.
 */
export function extractRackUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /^https?:\/\/(?:www\.)?modulargrid\.net\/e\/racks\/view\/(\d+)\/?$/
  );
  return match ? match[1] : null;
}

/**
 * Parse ModularGrid rack HTML page and extract module data.
 * The data is embedded in a <script type="application/json" data-mg-json="rtd"> tag.
 */
export function parseRackHtml(html: string): RackInfo {
  const scriptMatch = html.match(
    /<script\s+type="application\/json"\s+data-mg-json="rtd">([\s\S]*?)<\/script>/
  );

  if (!scriptMatch) {
    throw new Error("No rack data found in HTML");
  }

  const rawData: RawRackData = JSON.parse(scriptMatch[1]);
  const { Rack, User, Module: modules } = rawData.rack;

  const parsedModules: RackModule[] = modules.map(
    (mod: RawModuleData): RackModule => ({
      id: mod.id,
      name: mod.name,
      vendor: mod.Vendor.name,
      slug: mod.slug,
      hp: parseInt(mod.te, 10) || 0,
      description: mod.description,
      priceEur: parsePrice(mod.price_eur),
      priceUsd: parsePrice(mod.price_usd),
      row: parseInt(mod.ModulesRack.row, 10),
      col: parseInt(mod.ModulesRack.col, 10),
    })
  );

  // Sort by vendor, then name
  parsedModules.sort((a, b) => {
    const vendorCmp = a.vendor.localeCompare(b.vendor);
    if (vendorCmp !== 0) return vendorCmp;
    return a.name.localeCompare(b.name);
  });

  return {
    id: Rack.id,
    name: Rack.name,
    username: User.username,
    modules: parsedModules,
  };
}

function parsePrice(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : parseFloat(value);
  return isNaN(num) ? null : num;
}
