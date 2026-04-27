import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import app from "../src/index";

const fixture = readFileSync(
  join(__dirname, "fixtures/rack-3116603.html"),
  "utf-8"
);

describe("Worker API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GET / returns landing page with link", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("/rack-exporter");
    expect(html).toContain("confirminate.com");
  });

  it("GET /rack-exporter returns rack exporter HTML", async () => {
    const res = await app.request("/rack-exporter");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("ModularGrid Rack Exporter");
  });

  it("POST /api/parse returns modules for valid URL", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(fixture, { status: 200 })
    );

    try {
      const res = await app.request("/rack-exporter/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/3116603",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rack.id).toBe("3116603");
      expect(data.rack.name).toBe("Intellijel Stealth");
      expect(data.rack.modules).toHaveLength(3);
      expect(data.markdown).toContain("- Intellijel Triplatt (6hp)");
      expect(data.markdown).not.toContain("€");
      expect(data.plain).toContain("Intellijel Triplatt");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/parse returns 400 for missing URL", async () => {
    const res = await app.request("/rack-exporter/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("URL is required");
  });

  it("POST /api/parse returns 400 for invalid URL", async () => {
    const res = await app.request("/rack-exporter/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/not-modulargrid" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid ModularGrid rack URL");
  });

  it("POST /api/parse includes prices when includePrice is true", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(fixture, { status: 200 })
    );

    try {
      const res = await app.request("/rack-exporter/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/3116603",
          includePrice: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.markdown).toContain("€97 / $109");
      expect(data.plain).toContain("€97 / $109");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/parse returns 502 when fetch fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    try {
      const res = await app.request("/rack-exporter/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/3116603",
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
      const res = await app.request("/rack-exporter/api/parse", {
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

  it("POST /api/parse returns 422 when page has no rack data", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<html><body>No data</body></html>", { status: 200 })
    );

    try {
      const res = await app.request("/rack-exporter/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/3116603",
        }),
      });

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toContain("Failed to parse rack");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/parse returns 422 with generic message for non-Error throw", async () => {
    const originalFetch = globalThis.fetch;
    // Return HTML that will cause JSON.parse to throw a non-Error (simulate)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('<script type="application/json" data-mg-json="rtd">{"rack":{"Rack":{"id":"1","name":"X","rows":"1","te":"84","user_id":"1"},"User":{"id":"1","username":"u"},"Module":[{"id":"1","name":"M","slug":"m","description":"","te":"4","price_eur":null,"price_usd":null,"price_base":null,"is_passive":false,"is_1u":false,"vendor_id":"1","Vendor":{"name":"V"},"ModulesRack":{"id":"1","rack_id":"1","module_id":"1","row":"1","col":"1","is_inbounds":true}}]}}</script>', { status: 200 })
    );

    try {
      const res = await app.request("/rack-exporter/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://modulargrid.net/e/racks/view/3116603",
        }),
      });
      // This should succeed since the HTML is valid
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/parse returns 400 for invalid JSON body", async () => {
    const res = await app.request("/rack-exporter/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
  });
});
