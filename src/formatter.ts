import type { RackInfo, RackModule } from "./types";

export interface FormatOptions {
  includePrice?: boolean;
  discountPercent?: number;
}

function applyDiscount(price: number, discountPercent?: number): number {
  if (!discountPercent || discountPercent <= 0 || discountPercent >= 100) return price;
  return Math.round(price * (1 - discountPercent / 100));
}

function formatPrice(mod: RackModule, discountPercent?: number): string {
  const parts: string[] = [];
  if (mod.priceEur != null) parts.push(`€${applyDiscount(mod.priceEur, discountPercent)}`);
  if (mod.priceUsd != null) parts.push(`$${applyDiscount(mod.priceUsd, discountPercent)}`);
  return parts.length > 0 ? ` — ${parts.join(" / ")}` : "";
}

/**
 * Format rack modules as a markdown list suitable for WTS/FS posts.
 */
export function formatAsMarkdown(rack: RackInfo, options: FormatOptions = {}): string {
  const header = `## ${rack.name}\n\n*${rack.modules.length} modules — [ModularGrid](https://modulargrid.net/e/racks/view/${rack.id})*\n\n`;

  if (rack.modules.length === 0) return header;

  const lines = rack.modules.map((mod) => {
    const price = options.includePrice ? formatPrice(mod, options.discountPercent) : "";
    return `- ${mod.vendor} ${mod.name} (${mod.hp}hp)${price}`;
  });

  return header + lines.join("\n") + "\n";
}

/**
 * Format rack modules as a plain newline-separated list (vendor + name only).
 */
export function formatAsPlainList(rack: RackInfo, options: FormatOptions = {}): string {
  if (rack.modules.length === 0) return "";
  return rack.modules.map((mod) => {
    const price = options.includePrice ? formatPrice(mod, options.discountPercent) : "";
    return `${mod.vendor} ${mod.name}${price}`;
  }).join("\n");
}
