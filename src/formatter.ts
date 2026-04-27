import type { RackInfo, RackModule } from "./types";

export interface FormatOptions {
  includePrice?: boolean;
}

function formatPrice(mod: RackModule): string {
  const parts: string[] = [];
  if (mod.priceEur != null) parts.push(`€${mod.priceEur}`);
  if (mod.priceUsd != null) parts.push(`$${mod.priceUsd}`);
  return parts.length > 0 ? ` — ${parts.join(" / ")}` : "";
}

/**
 * Format rack modules as a markdown list suitable for WTS/FS posts.
 */
export function formatAsMarkdown(rack: RackInfo, options: FormatOptions = {}): string {
  const header = `## ${rack.name}\n\n*${rack.modules.length} modules — [ModularGrid](https://modulargrid.net/e/racks/view/${rack.id})*\n\n`;

  if (rack.modules.length === 0) return header;

  const lines = rack.modules.map((mod) => {
    const price = options.includePrice ? formatPrice(mod) : "";
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
    const price = options.includePrice ? formatPrice(mod) : "";
    return `${mod.vendor} ${mod.name}${price}`;
  }).join("\n");
}
