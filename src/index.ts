import { Hono } from "hono";
import { extractRackUrl, parseRackHtml, sortModules } from "./parser";
import type { SortBy } from "./parser";
import { formatAsMarkdown, formatAsPlainList } from "./formatter";

const app = new Hono();

// Landing page
app.get("/", (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>confirminate.com</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 700px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
    h1 { margin-bottom: 1rem; }
    ul { list-style: none; }
    li { margin-bottom: 0.5rem; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .desc { color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>confirminate.com</h1>
  <ul>
    <li><a href="/rack-exporter">ModularGrid Rack Exporter</a> <span class="desc">&mdash; Generate module lists from ModularGrid rack URLs</span></li>
  </ul>
</body>
</html>`);
});

// Rack Exporter page
app.get("/rack-exporter", (c) => {
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
    .form-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
    input[type="url"] { flex: 1; padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
    button { padding: 0.5rem 1.25rem; background: #2563eb; color: white; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #93c5fd; cursor: not-allowed; }
    pre { white-space: pre-wrap; font-family: monospace; background: #f5f5f5; padding: 1rem; border-radius: 4px; border: 1px solid #e5e5e5; overflow-x: auto; }
    .copy-btn { background: #059669; }
    .copy-btn:hover { background: #047857; }
  </style>
</head>
<body>
  <h1>ModularGrid Rack Exporter</h1>
  <p class="subtitle">Paste a ModularGrid rack URL to get a copyable module list for your WTS/FS/FT post.</p>
  <div id="app"></div>
  <script type="module">
    import van from "https://cdn.jsdelivr.net/npm/vanjs-core@1.5.5/src/van.min.js";

    const { div, form, input, button, pre, p, label, span, fieldset, legend } = van.tags;

    const url = van.state("");
    const loading = van.state(false);
    const error = van.state("");
    const markdown = van.state("");
    const copied = van.state(false);
    const rackName = van.state("");
    const moduleCount = van.state(0);
    const includePrice = van.state(false);
    const sortBy = van.state("manufacturer");
    const discountPct = van.state(0);
    let lastRack = null;

    const sortFns = {
      manufacturer: (a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name),
      price: (a, b) => (a.priceUsd ?? a.priceEur ?? Infinity) - (b.priceUsd ?? b.priceEur ?? Infinity),
      hp: (a, b) => a.hp - b.hp,
    };

    const applyDisc = (p) => {
      const d = discountPct.val;
      return (d > 0 && d < 100) ? Math.round(p * (1 - d / 100)) : p;
    };

    const fmtLine = (m) => {
      let line = "- " + m.vendor + " " + m.name + " (" + m.hp + "hp)";
      if (includePrice.val) {
        const parts = [];
        if (m.priceEur != null) parts.push("\u20ac" + applyDisc(m.priceEur));
        if (m.priceUsd != null) parts.push("$" + applyDisc(m.priceUsd));
        if (parts.length) line += " \u2014 " + parts.join(" / ");
      }
      return line;
    };

    const reformat = () => {
      if (!lastRack) return;
      const mods = [...lastRack.modules].sort(sortFns[sortBy.val]);
      const nl = String.fromCharCode(10);
      const header = "## " + lastRack.name + nl + nl + "*" + mods.length + " modules \u2014 [ModularGrid](https://modulargrid.net/e/racks/view/" + lastRack.id + ")*" + nl + nl;
      markdown.val = header + mods.map(fmtLine).join(nl) + nl;
    };

    const copyText = async (text) => {
      await navigator.clipboard.writeText(text);
      copied.val = true;
      setTimeout(() => copied.val = false, 2000);
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      error.val = "";
      markdown.val = "";
      loading.val = true;
      try {
        const discountVal = parseInt(document.getElementById('discount')?.value || '0', 10);
        const res = await fetch("/rack-exporter/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.val, includePrice: true, sortBy: sortBy.val, discountPercent: discountVal || undefined }),
        });
        const data = await res.json();
        if (!res.ok) { error.val = data.error; return; }
        lastRack = data.rack;
        rackName.val = data.rack.name;
        moduleCount.val = data.rack.modules.length;
        reformat();
      } catch (err) {
        error.val = "Request failed. Please try again.";
      } finally {
        loading.val = false;
      }
    };

    van.add(document.getElementById("app"),
      form({ onsubmit: handleSubmit },
        div({ class: "form-row" },
          input({ type: "url", placeholder: "https://modulargrid.net/e/racks/view/...", oninput: e => url.val = e.target.value, value: url, required: true }),
          button({ type: "submit", disabled: loading }, () => loading.val ? "Loading..." : "Export"),
        ),
        div({ style: "display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap;" },
          label({ style: "display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; cursor: pointer;" },
            input({ type: "checkbox", checked: includePrice, onchange: e => { includePrice.val = e.target.checked; reformat(); } }),
            "Include prices",
          ),
          label({ style: "display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem;" },
            "Discount %:",
            input({ id: "discount", type: "number", min: "0", max: "99", value: "0", style: "width: 4rem; padding: 0.25rem 0.4rem; border: 1px solid #ccc; border-radius: 4px;", oninput: e => { discountPct.val = parseInt(e.target.value, 10) || 0; reformat(); } }),
          ),
          span({ style: "font-size: 0.9rem; color: #666;" }, "Sort by:"),
          ...["manufacturer", "price", "hp"].map(s =>
            label({ style: "display: flex; align-items: center; gap: 0.25rem; font-size: 0.9rem; cursor: pointer;" },
              input({ type: "radio", name: "sortBy", value: s, checked: s === "manufacturer", onchange: () => { sortBy.val = s; reformat(); } }),
              s === "hp" ? "HP" : s.charAt(0).toUpperCase() + s.slice(1),
            )
          ),
        ),
      ),
      () => error.val ? p({ style: "color: #dc2626; margin: 1rem 0;" }, error.val) : "",
      () => markdown.val ? div(
        p({ style: "margin: 1rem 0 0.5rem; font-weight: bold;" }, () => rackName.val + " \u2014 " + moduleCount.val + " modules"),
        pre(markdown),
        button({ class: "copy-btn", onclick: () => copyText(markdown.val), style: "margin-top: 0.5rem;" },
          () => copied.val ? "Copied!" : "Copy Markdown"
        ),
      ) : "",
    );
  </script>
</body>
</html>`);
});

// Helper: fetch and parse a rack from ModularGrid
type FetchResult =
  | { rack: ReturnType<typeof parseRackHtml> }
  | { error: string; status: 502 | 422 };

async function fetchAndParseRack(rackId: string): Promise<FetchResult> {
  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    response = await fetch(
      `https://www.modulargrid.net/e/racks/view/${rackId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; RackExporter/1.0; +https://github.com/dangayle/modular)",
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "ModularGrid request timed out", status: 502 };
    }
    return { error: "Failed to fetch rack page", status: 502 };
  }

  if (!response.ok) {
    return { error: `ModularGrid returned status ${response.status}`, status: 502 };
  }

  const html = await response.text();
  try {
    const rack = parseRackHtml(html);
    return { rack };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse error";
    return { error: `Failed to parse rack: ${message}`, status: 422 };
  }
}

// Sanitize discount query param: must be a finite number in (0, 100), else undefined
function parseDiscount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return undefined;
  return n;
}

// GET /rack-exporter/:rackId — returns markdown directly (great for LLMs)
app.get("/rack-exporter/:rackId{[0-9]+}", async (c) => {
  const rackId = c.req.param("rackId");

  // Guard: rack IDs are numeric but shouldn't be absurdly long
  if (rackId.length > 12) {
    return c.json({ error: "Invalid rack ID" }, 400);
  }

  const query = c.req.query();
  const validSorts = ["manufacturer", "price", "hp"] as const;
  const sortBy: SortBy = validSorts.includes(query.sort as any) ? (query.sort as SortBy) : "manufacturer";
  const includePrice = query.prices !== "false";
  const discountPercent = parseDiscount(query.discount);
  const format = query.format === "json" ? "json" : "markdown";

  const result = await fetchAndParseRack(rackId);

  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }

  const { rack } = result;
  sortModules(rack.modules, sortBy);
  const formatOpts = { includePrice, discountPercent };

  // Cache successful responses for 5 minutes (rack data doesn't change often)
  c.header("Cache-Control", "public, max-age=300, s-maxage=300");

  if (format === "json") {
    return c.json({
      rack,
      markdown: formatAsMarkdown(rack, formatOpts),
      plain: formatAsPlainList(rack, formatOpts),
    });
  }

  const markdownOutput = formatAsMarkdown(rack, formatOpts);
  return c.text(markdownOutput);
});

// API endpoint to parse a rack
app.post("/rack-exporter/api/parse", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { url, includePrice, sortBy: rawSortBy, discountPercent: rawDiscount } = body as {
    url?: string;
    includePrice?: boolean;
    sortBy?: string;
    discountPercent?: number;
  };
  const validSorts = ["manufacturer", "price", "hp"] as const;
  const sortBy: SortBy = validSorts.includes(rawSortBy as any) ? (rawSortBy as SortBy) : "manufacturer";
  const discountPercent = typeof rawDiscount === "number" && rawDiscount > 0 && rawDiscount < 100 ? rawDiscount : undefined;

  if (!url) {
    return c.json({ error: "URL is required" }, 400);
  }

  const rackId = extractRackUrl(url);
  if (!rackId) {
    return c.json({ error: "Invalid ModularGrid rack URL" }, 400);
  }

  const result = await fetchAndParseRack(rackId);

  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }

  const { rack } = result;
  sortModules(rack.modules, sortBy);
  const formatOpts = { includePrice: !!includePrice, discountPercent };
  const markdownOutput = formatAsMarkdown(rack, formatOpts);
  const plainOutput = formatAsPlainList(rack, formatOpts);

  return c.json({
    rack,
    markdown: markdownOutput,
    plain: plainOutput,
  });
});

export default app;
