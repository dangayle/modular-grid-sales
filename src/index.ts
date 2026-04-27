import { Hono } from "hono";
import { extractRackUrl, parseRackHtml } from "./parser";
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

    const { div, form, input, button, pre, p, label } = van.tags;

    const url = van.state("");
    const loading = van.state(false);
    const error = van.state("");
    const markdown = van.state("");
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
      loading.val = true;
      try {
        const res = await fetch("/rack-exporter/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.val, includePrice: includePrice.val }),
        });
        const data = await res.json();
        if (!res.ok) { error.val = data.error; return; }
        markdown.val = data.markdown;
        rackName.val = data.rack.name;
        moduleCount.val = data.rack.modules.length;
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
        label({ style: "display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; cursor: pointer;" },
          input({ type: "checkbox", checked: includePrice, onchange: e => includePrice.val = e.target.checked }),
          "Include prices",
        ),
      ),
      () => error.val ? p({ style: "color: #dc2626; margin: 1rem 0;" }, error.val) : "",
      () => markdown.val ? div(
        p({ style: "margin: 1rem 0 0.5rem; font-weight: bold;" }, () => rackName.val + " \\u2014 " + moduleCount.val + " modules"),
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

// API endpoint to parse a rack
app.post("/rack-exporter/api/parse", async (c) => {
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
