# ModularGrid Rack List Exporter — Implementation Plan

> For agentic workers: REQUIRED: Use subagent-driven-development
> (if subagents available) or executing-plans to implement this plan.

**Goal:** Build a Cloudflare Worker web app that accepts a ModularGrid rack URL, fetches/parses the page, extracts all modules, and outputs a copyable markdown list for WTS/FS/FT posts.

**Architecture:** A single Cloudflare Worker serves both the HTML frontend and an API endpoint. The worker fetches the ModularGrid rack page server-side, extracts the embedded JSON from `<script type="application/json" data-mg-json="rtd">`, parses out module data (name, manufacturer, HP, price), and returns it as structured JSON. The frontend uses VanJS for reactivity (showing results, copy button state). The page is flat HTML with minimal JS.

**Tech Stack:**
- Vite+ (vp) — build toolchain, dev server, Vitest for testing
- @cloudflare/vite-plugin — Workers dev/build integration
- Hono — lightweight HTTP framework for routing
- VanJS — reactive UI (1kB, no build step needed)
- TypeScript throughout
- 100% test coverage via Vitest

---

## Data Model

ModularGrid embeds rack data in the HTML inside:
```html
<script type="application/json" data-mg-json="rtd">
{"rack":{"Rack":{...},"User":{...},"Patch":[],"Module":[
  {"id":"43298","name":"Particles","slug":"patching-panda-particles","description":"...","te":"12","current5v":"0","current_plus":"66","current_min":"16","depth":"32","price_eur":"299","price_usd":"309","price_base":"eur","is_passive":false,"is_1u":false,"vendor_id":"661","ModulesRack":{...},"Vendor":{"name":"Patching Panda"},"Version":[...]},
  ...
]}}
</script>
```

Key fields per module:
- `name` — module name
- `Vendor.name` — manufacturer
- `te` — HP width
- `slug` — used for URL: `https://modulargrid.net/e/<slug>`
- `price_eur`, `price_usd` — listed prices
- `description` — short description

---

## File Structure

```
modular/
├── package.json
├── vite.config.ts
├── wrangler.toml
├── tsconfig.json
├── src/
│   ├── index.ts              # Hono app entry (Worker)
│   ├── parser.ts             # HTML parsing: extract JSON, map to Module[]
│   ├── formatter.ts          # Module[] → markdown string
│   └── types.ts              # Shared type definitions
├── public/
│   └── index.html            # Static HTML page with VanJS
├── test/
│   ├── parser.test.ts        # Parser unit tests
│   ├── formatter.test.ts     # Formatter unit tests
│   ├── integration.test.ts   # Full worker request/response tests
│   └── fixtures/
│       └── rack-2688230.html # Saved HTML fixture for testing
└── docs/
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `wrangler.toml`
- Create: `src/types.ts`

- [ ] Step 1: Initialize project with vp and install dependencies

```bash
cd /Users/dangayle/src/modular
curl -fsSL https://vite.plus | bash  # if not already installed
vp init --template cloudflare-worker  # or manual setup below
```

If `vp init` doesn't have that template, manually create:

```bash
npm init -y
npm install hono
npm install -D vite @cloudflare/vite-plugin vitest @cloudflare/workers-types wrangler typescript
```

- [ ] Step 2: Create `package.json`

```json
{
  "name": "modulargrid-rack-exporter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "hono": "^4"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "^1",
    "@cloudflare/workers-types": "^4",
    "typescript": "^5",
    "vite": "^6",
    "vitest": "^3",
    "@vitest/coverage-v8": "^3",
    "wrangler": "^4"
  }
}
```

- [ ] Step 3: Create `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types", "vitest/globals"]
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules"]
}
```

- [ ] Step 4: Create `vite.config.ts`

```typescript
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
```

- [ ] Step 5: Create `wrangler.toml`

```toml
name = "modulargrid-rack-exporter"
compatibility_date = "2025-04-01"
main = "src/index.ts"

[assets]
directory = "public"
```

- [ ] Step 6: Create `src/types.ts`

```typescript
export interface RackModule {
  id: string;
  name: string;
  vendor: string;
  slug: string;
  hp: number;
  description: string;
  priceEur: number | null;
  priceUsd: number | null;
  row: number;
  col: number;
}

export interface RackInfo {
  id: string;
  name: string;
  username: string;
  modules: RackModule[];
}

export interface RawModuleData {
  id: string;
  name: string;
  slug: string;
  description: string;
  te: string;
  price_eur: string | null;
  price_usd: string | number | null;
  price_base: string | null;
  is_passive: boolean;
  is_1u: boolean;
  vendor_id: string;
  Vendor: { name: string };
  ModulesRack: {
    id: string;
    rack_id: string;
    module_id: string;
    row: string;
    col: string;
    is_inbounds: boolean;
  };
}

export interface RawRackData {
  rack: {
    Rack: {
      id: string;
      name: string;
      rows: string;
      te: string;
      user_id: string;
    };
    User: {
      id: string;
      username: string;
    };
    Module: RawModuleData[];
  };
}
```

- [ ] Step 7: Install dependencies and verify

```bash
npm install
npx tsc --noEmit
```

- [ ] Step 8: Commit

```bash
git add -A
git commit -m "chore: scaffold project with vite, hono, cloudflare worker"
```

---

## Task 2: Parser Module (TDD)

**Files:**
- Create: `test/fixtures/rack-2688230.html` (truncated fixture)
- Create: `test/parser.test.ts`
- Create: `src/parser.ts`

**Depends on:** Task 1

- [ ] Step 1: Save a test fixture

Save a minimal HTML fixture containing the `<script type="application/json" data-mg-json="rtd">` block with 3 modules. This avoids hitting the network in tests.

```bash
# Extract from the full page and save as fixture (manually trim to 3 modules)
```

Create `test/fixtures/rack-2688230.html`:
```html
<!DOCTYPE html>
<html>
<head><title>For Sale - Eurorack Modular System from KADABADIK on ModularGrid</title></head>
<body>
<script type="application/json" data-mg-json="rtd">
{"rack":{"Rack":{"id":"2688230","modified":"2026-04-27 22:41:35","modifiedthumb":"2026-04-26 20:29:31","name":"For Sale","url":"","user_id":"207454","rows":"10","te":"84","width":null,"height":null,"format":"e","is_private":false,"theme_id":"10","specific_id":"1","rows1u":["3","4"],"rows1usystem":null,"comment":null},"User":{"id":"207454","username":"KADABADIK","optin":true,"show_rack_price":false,"has_img":true,"prodate":"2025-05-09 13:31:54","is_vip":false},"Patch":[],"Module":[{"id":"43298","name":"Particles","slug":"patching-panda-particles","description":"Trigger modulation and pattern variation designer.","te":"12","current5v":"0","current_plus":"66","current_min":"16","depth":"32","price_eur":"299","price_usd":"309","price_base":"eur","is_passive":false,"is_1u":false,"vendor_id":"661","ModulesRack":{"id":"102270805","created":"2024-11-03 04:23:06","modified":"2025-12-28 00:06:59","rack_id":"2688230","module_id":"43298","row":"2","col":"1","is_inbounds":true,"version_id":"128608","orientation":"0"},"Vendor":{"name":"Patching Panda"},"Version":[]},{"id":"20758","name":"NUTONE","slug":"plankton-electronics-nutone","description":"Dual channel VCA and distortion.","te":"8","current5v":"0","current_plus":"55","current_min":"17","depth":"34","price_eur":"220","price_usd":"260","price_base":null,"is_passive":false,"is_1u":false,"vendor_id":"728","ModulesRack":{"id":"102270844","created":"2024-11-03 04:25:43","modified":"2026-04-27 18:03:22","rack_id":"2688230","module_id":"20758","row":"2","col":"50","is_inbounds":true,"version_id":null,"orientation":"0"},"Vendor":{"name":"Plankton Electronics"},"Version":[]},{"id":"38061","name":"PUNK","slug":"feedback-punk","description":"Multipurpose sound destruction module","te":"6","current5v":"0","current_plus":"45","current_min":"25","depth":"35","price_eur":"85","price_usd":"99","price_base":"eur","is_passive":false,"is_1u":false,"vendor_id":"403","ModulesRack":{"id":"102270987","created":"2024-11-03 04:27:26","modified":"2026-04-27 18:03:18","rack_id":"2688230","module_id":"38061","row":"2","col":"79","is_inbounds":true,"version_id":null,"orientation":"0"},"Vendor":{"name":"Feedback"},"Version":[]}]}}
</script>
</body>
</html>
```

- [ ] Step 2: Write failing parser tests

Create `test/parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRackHtml, extractRackUrl } from "../src/parser";

const fixture = readFileSync(
  join(__dirname, "fixtures/rack-2688230.html"),
  "utf-8"
);

describe("extractRackUrl", () => {
  it("extracts rack ID from standard URL", () => {
    expect(extractRackUrl("https://modulargrid.net/e/racks/view/2688230")).toBe(
      "2688230"
    );
  });

  it("extracts rack ID from www URL", () => {
    expect(
      extractRackUrl("https://www.modulargrid.net/e/racks/view/2688230")
    ).toBe("2688230");
  });

  it("extracts rack ID from URL with trailing slash", () => {
    expect(
      extractRackUrl("https://modulargrid.net/e/racks/view/2688230/")
    ).toBe("2688230");
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
    expect(result.id).toBe("2688230");
    expect(result.name).toBe("For Sale");
    expect(result.username).toBe("KADABADIK");
  });

  it("extracts all modules", () => {
    const result = parseRackHtml(fixture);
    expect(result.modules).toHaveLength(3);
  });

  it("parses module fields correctly", () => {
    const result = parseRackHtml(fixture);
    const first = result.modules[0];
    expect(first.id).toBe("43298");
    expect(first.name).toBe("Particles");
    expect(first.vendor).toBe("Patching Panda");
    expect(first.slug).toBe("patching-panda-particles");
    expect(first.hp).toBe(12);
    expect(first.priceEur).toBe(299);
    expect(first.priceUsd).toBe(309);
    expect(first.description).toBe(
      "Trigger modulation and pattern variation designer."
    );
    expect(first.row).toBe(2);
    expect(first.col).toBe(1);
  });

  it("handles null prices", () => {
    const result = parseRackHtml(fixture);
    // NUTONE has price_base: null but still has price values
    const nutone = result.modules[1];
    expect(nutone.priceEur).toBe(220);
    expect(nutone.priceUsd).toBe(260);
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

  it("sorts modules by row then col", () => {
    const result = parseRackHtml(fixture);
    for (let i = 1; i < result.modules.length; i++) {
      const prev = result.modules[i - 1];
      const curr = result.modules[i];
      const prevSort = prev.row * 10000 + prev.col;
      const currSort = curr.row * 10000 + curr.col;
      expect(currSort).toBeGreaterThanOrEqual(prevSort);
    }
  });
});
```

- [ ] Step 3: Run tests to verify failure

```bash
npx vitest run test/parser.test.ts
```
Expected: FAIL — module `../src/parser` not found

- [ ] Step 4: Implement `src/parser.ts`

```typescript
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

  // Sort by row, then col
  parsedModules.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
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
```

- [ ] Step 5: Run tests to verify they pass

```bash
npx vitest run test/parser.test.ts
```
Expected: PASS (9 tests)

- [ ] Step 6: Commit

```bash
git add -A
git commit -m "feat: add rack HTML parser with URL extraction"
```

---

## Task 3: Formatter Module (TDD)

**Files:**
- Create: `test/formatter.test.ts`
- Create: `src/formatter.ts`

**Depends on:** Task 1 (types)

- [ ] Step 1: Write failing formatter tests

Create `test/formatter.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { formatAsMarkdown, formatAsPlainList, type FormatOptions } from "../src/formatter";
import type { RackInfo } from "../src/types";

const sampleRack: RackInfo = {
  id: "2688230",
  name: "For Sale",
  username: "KADABADIK",
  modules: [
    {
      id: "43298",
      name: "Particles",
      vendor: "Patching Panda",
      slug: "patching-panda-particles",
      hp: 12,
      description: "Trigger modulation and pattern variation designer.",
      priceEur: 299,
      priceUsd: 309,
      row: 2,
      col: 1,
    },
    {
      id: "20758",
      name: "NUTONE",
      vendor: "Plankton Electronics",
      slug: "plankton-electronics-nutone",
      hp: 8,
      description: "Dual channel VCA and distortion.",
      priceEur: 220,
      priceUsd: 260,
      row: 2,
      col: 50,
    },
    {
      id: "38061",
      name: "PUNK",
      vendor: "Feedback",
      slug: "feedback-punk",
      hp: 6,
      description: "Multipurpose sound destruction module",
      priceEur: 85,
      priceUsd: 99,
      row: 2,
      col: 79,
    },
  ],
};

describe("formatAsMarkdown", () => {
  it("produces a markdown list with vendor and name", () => {
    const result = formatAsMarkdown(sampleRack);
    expect(result).toContain("- Patching Panda Particles");
    expect(result).toContain("- Plankton Electronics NUTONE");
    expect(result).toContain("- Feedback PUNK");
  });

  it("includes HP in parentheses", () => {
    const result = formatAsMarkdown(sampleRack);
    expect(result).toContain("(12hp)");
    expect(result).toContain("(8hp)");
    expect(result).toContain("(6hp)");
  });

  it("does not include price by default", () => {
    const result = formatAsMarkdown(sampleRack);
    expect(result).not.toContain("$");
    expect(result).not.toContain("€");
  });

  it("includes price when includePrice is true", () => {
    const result = formatAsMarkdown(sampleRack, { includePrice: true });
    expect(result).toContain("- Patching Panda Particles (12hp) — €299 / $309");
    expect(result).toContain("- Feedback PUNK (6hp) — €85 / $99");
  });

  it("shows only available price when one is null", () => {
    const rack: RackInfo = {
      ...sampleRack,
      modules: [
        { ...sampleRack.modules[0], priceEur: 299, priceUsd: null },
      ],
    };
    const result = formatAsMarkdown(rack, { includePrice: true });
    expect(result).toContain("— €299");
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
    expect(result).toContain("- Patching Panda Particles (12hp)");
    expect(result).not.toContain("—");
  });

  it("includes a header with rack name", () => {
    const result = formatAsMarkdown(sampleRack);
    expect(result).toMatch(/^## For Sale/m);
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
    expect(lines[0]).toBe("Patching Panda Particles");
    expect(lines[1]).toBe("Plankton Electronics NUTONE");
    expect(lines[2]).toBe("Feedback PUNK");
  });

  it("includes price when includePrice is true", () => {
    const result = formatAsPlainList(sampleRack, { includePrice: true });
    const lines = result.trim().split("\n");
    expect(lines[0]).toBe("Patching Panda Particles — €299 / $309");
  });

  it("handles empty module list", () => {
    const emptyRack: RackInfo = { ...sampleRack, modules: [] };
    const result = formatAsPlainList(emptyRack);
    expect(result).toBe("");
  });
});
```

- [ ] Step 2: Run tests to verify failure

```bash
npx vitest run test/formatter.test.ts
```
Expected: FAIL — module not found

- [ ] Step 3: Implement `src/formatter.ts`

```typescript
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
```

- [ ] Step 4: Run tests to verify they pass

```bash
npx vitest run test/formatter.test.ts
```
Expected: PASS (7 tests)

- [ ] Step 5: Commit

```bash
git add -A
git commit -m "feat: add markdown and plain text formatters"
```

---

## Task 4: Hono Worker App (TDD)

**Files:**
- Create: `test/integration.test.ts`
- Create: `src/index.ts`

**Depends on:** Task 2, Task 3

- [ ] Step 1: Write failing integration tests

Create `test/integration.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../src/index";

// Mock global fetch for the worker
const mockFetch = vi.fn();

describe("Worker API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockReset();
  });

  it("GET / returns HTML page", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("POST /api/parse returns modules for valid URL", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fixture = readFileSync(
      join(__dirname, "fixtures/rack-2688230.html"),
      "utf-8"
    );

    // Mock the fetch that the worker does to modulargrid
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(fixture, { status: 200 })
    );

    try {
      const res = await app.request("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/2688230",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rack.id).toBe("2688230");
      expect(data.rack.name).toBe("For Sale");
      expect(data.rack.modules).toHaveLength(3);
      expect(data.markdown).toContain("- Patching Panda Particles (12hp)");
      expect(data.markdown).not.toContain("€");
      expect(data.plain).toContain("Patching Panda Particles");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/parse returns 400 for missing URL", async () => {
    const res = await app.request("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("URL is required");
  });

  it("POST /api/parse returns 400 for invalid URL", async () => {
    const res = await app.request("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/not-modulargrid" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid ModularGrid rack URL");
  });

  it("POST /api/parse includes prices when includePrice is true", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fixture = readFileSync(
      join(__dirname, "fixtures/rack-2688230.html"),
      "utf-8"
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(fixture, { status: 200 })
    );

    try {
      const res = await app.request("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/2688230",
          includePrice: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.markdown).toContain("€299 / $309");
      expect(data.plain).toContain("€299 / $309");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/parse returns 502 when fetch fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    try {
      const res = await app.request("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/2688230",
        }),
      });

      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain("Failed to fetch rack page");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/parse returns 502 when modulargrid returns non-200", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Not Found", { status: 404 })
    );

    try {
      const res = await app.request("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/9999999",
        }),
      });

      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain("ModularGrid returned status 404");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] Step 2: Run tests to verify failure

```bash
npx vitest run test/integration.test.ts
```
Expected: FAIL — module `../src/index` not found

- [ ] Step 3: Implement `src/index.ts`

```typescript
import { Hono } from "hono";
import { extractRackUrl, parseRackHtml } from "./parser";
import { formatAsMarkdown, formatAsPlainList } from "./formatter";

const app = new Hono();

// Serve the HTML page for GET /
app.get("/", (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ModularGrid Rack Exporter</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 700px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
    h1 { margin-bottom: 0.5rem; }
    p.subtitle { color: #666; margin-bottom: 2rem; }
    form { display: flex; gap: 0.5rem; margin-bottom: 2rem; }
    input[type="url"] { flex: 1; padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
    button { padding: 0.5rem 1.25rem; background: #2563eb; color: white; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #93c5fd; cursor: not-allowed; }
    #error { color: #dc2626; margin-bottom: 1rem; }
    #result { white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 1rem; border-radius: 4px; border: 1px solid #e5e5e5; display: none; }
    .copy-btn { margin-top: 0.5rem; background: #059669; }
    .copy-btn:hover { background: #047857; }
    .copy-btn.copied { background: #6b7280; }
  </style>
</head>
<body>
  <h1>ModularGrid Rack Exporter</h1>
  <p class="subtitle">Paste a ModularGrid rack URL to get a copyable module list for your WTS/FS/FT post.</p>
  <div id="app"></div>
  <script type="module" src="https://cdn.jsdelivr.net/npm/van@1.5.3/van.min.js"></script>
  <script type="module">
    import van from "https://cdn.jsdelivr.net/npm/van@1.5.3/van.min.js";


    const url = van.state("");
    const loading = van.state(false);
    const error = van.state("");
    const markdown = van.state("");
    const plain = van.state("");
    const copied = van.state(false);
    const rackName = van.state("");
    const moduleCount = van.state(0);
    const includePrice = van.state(false);

    const copyText = async (text) => {
      await navigator.clipboard.writeText(text);
      copied.val = true;
      setTimeout(() => copied.val = false, 2000);
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      error.val = "";
      markdown.val = "";
      plain.val = "";
      loading.val = true;
      try {
        const res = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.val, includePrice: includePrice.val }),
        });
        const data = await res.json();
        if (!res.ok) { error.val = data.error; return; }
        markdown.val = data.markdown;
        plain.val = data.plain;
        rackName.val = data.rack.name;
        moduleCount.val = data.rack.modules.length;
      } catch (err) {
        error.val = "Request failed. Please try again.";
      } finally {
        loading.val = false;
      }
    };

    const { div, form, input, button, pre, p, span, label } = van.tags;

    van.add(document.getElementById("app"),
      form({ onsubmit: handleSubmit },
        input({ type: "url", placeholder: "https://modulargrid.net/e/racks/view/...", oninput: e => url.val = e.target.value, value: url, required: true }),
        button({ type: "submit", disabled: loading }, () => loading.val ? "Loading..." : "Export"),
        label({ style: "display: flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem; font-size: 0.9rem; cursor: pointer;" },
          input({ type: "checkbox", checked: includePrice, onchange: e => includePrice.val = e.target.checked }),
          "Include price",
        ),
      ),
      () => error.val ? p({ style: "color: #dc2626; margin: 1rem 0;" }, error.val) : "",
      () => markdown.val ? div(
        p({ style: "margin: 1rem 0 0.5rem; font-weight: bold;" }, () => rackName.val + " — " + moduleCount.val + " modules"),
        pre({ style: "white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 1rem; border-radius: 4px; border: 1px solid #e5e5e5; overflow-x: auto;" }, markdown),
        button({ onclick: () => copyText(markdown.val), style: "margin-top: 0.5rem; padding: 0.5rem 1rem; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer;" },
          () => copied.val ? "Copied!" : "Copy Markdown"
        ),
      ) : "",
    );
  </script>
</body>
</html>`);
});

// API endpoint to parse a rack
app.post("/api/parse", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { url, includePrice } = body as { url?: string; includePrice?: boolean };

  if (!url) {
    return c.json({ error: "URL is required" }, 400);
  }

  const rackId = extractRackUrl(url);
  if (!rackId) {
    return c.json({ error: "Invalid ModularGrid rack URL" }, 400);
  }

  let response: Response;
  try {
    response = await fetch(
      `https://www.modulargrid.net/e/racks/view/${rackId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; RackExporter/1.0; +https://github.com/dangayle/modular)",
        },
      }
    );
  } catch (err) {
    return c.json({ error: "Failed to fetch rack page" }, 502);
  }

  if (!response.ok) {
    return c.json(
      { error: `ModularGrid returned status ${response.status}` },
      502
    );
  }

  const html = await response.text();

  try {
    const rack = parseRackHtml(html);
    const formatOpts = { includePrice: !!includePrice };
    const markdownOutput = formatAsMarkdown(rack, formatOpts);
    const plainOutput = formatAsPlainList(rack, formatOpts);

    return c.json({
      rack,
      markdown: markdownOutput,
      plain: plainOutput,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse error";
    return c.json({ error: `Failed to parse rack: ${message}` }, 422);
  }
});

export default app;
```

- [ ] Step 4: Run tests to verify they pass

```bash
npx vitest run test/integration.test.ts
```
Expected: PASS (6 tests)

- [ ] Step 5: Commit

```bash
git add -A
git commit -m "feat: add Hono worker with API and HTML frontend"
```

---

## Task 5: Static HTML Frontend

**Files:**
- Create: `public/index.html` (optional — if we want to split inline HTML from the Hono handler)

Note: The frontend is already inline in the `GET /` handler from Task 4 using VanJS loaded from CDN. This keeps things maximally flat. If we want the frontend to be a static file served by Cloudflare's asset handling instead, we can move it to `public/index.html` and remove the `GET /` handler. For now, the inline approach works.

No additional work needed here — Task 4 covers it.

---

## Task 6: Full Test Coverage & Edge Cases

**Files:**
- Modify: `test/parser.test.ts` — add edge cases
- Modify: `test/integration.test.ts` — add edge cases

**Depends on:** Task 2, Task 3, Task 4

- [ ] Step 1: Add edge case parser tests

Add to `test/parser.test.ts`:
```typescript
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
});

function makeFixture(modules: any[]): string {
  const data = {
    rack: {
      Rack: { id: "1", name: "Test Rack", rows: "3", te: "84", user_id: "1", modified: "", modifiedthumb: "", url: "", width: null, height: null, format: "e", is_private: false, theme_id: "1", specific_id: "1", rows1u: [], rows1usystem: null, comment: null },
      User: { id: "1", username: "testuser", optin: true, show_rack_price: false, has_img: false, prodate: null, is_vip: false },
      Patch: [],
      Module: modules,
    },
  };
  return `<script type="application/json" data-mg-json="rtd">${JSON.stringify(data)}</script>`;
}
```

- [ ] Step 2: Add edge case integration tests

Add to `test/integration.test.ts`:
```typescript
describe("Worker API edge cases", () => {
  it("POST /api/parse returns 422 when page has no rack data", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html><body>No data</body></html>", { status: 200 })
    );

    try {
      const res = await app.request("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/2688230",
        }),
      });

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toContain("Failed to parse rack");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/parse returns 400 for invalid JSON body", async () => {
    const res = await app.request("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
  });
});
```

- [ ] Step 3: Run full test suite with coverage

```bash
npx vitest run --coverage
```
Expected: PASS — 100% coverage

- [ ] Step 4: Commit

```bash
git add -A
git commit -m "test: add edge cases for 100% coverage"
```

---

## Task 7: Deploy & Verify

**Files:** None (deployment only)

**Depends on:** Task 6

- [ ] Step 1: Build the project

```bash
npx vite build
```

- [ ] Step 2: Deploy to Cloudflare

```bash
npx wrangler deploy
```

- [ ] Step 3: Test the deployed URL

Open the deployed URL in a browser, paste `https://modulargrid.net/e/racks/view/2688230`, and verify the module list appears.

- [ ] Step 4: Commit any final adjustments

```bash
git add -A
git commit -m "chore: verify deployment configuration"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Scaffolding | — |
| 2 | Parser | 9 unit tests |
| 3 | Formatter | 7 unit tests |
| 4 | Worker + API | 6 integration tests |
| 5 | Frontend (inline) | covered by Task 4 |
| 6 | Edge cases | +4 tests |
| 7 | Deploy | manual verification |

Total: ~26 automated tests, 100% coverage on `src/`.
