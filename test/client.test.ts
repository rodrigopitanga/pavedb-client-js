// (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com>
// SPDX-License-Identifier: Apache-2.0

// Contract table: every public method must hit the documented PaveDB
// route with the documented HTTP method. This is the test that catches
// method/path drift against the core (`/v1` on PaveDB >= 0.9.x) — the
// class of bug where a create silently 405s in production.
import { describe, expect, it } from "vitest";
import { PaveDBClient, PaveDBError } from "../src/index.js";

interface Captured {
  method: string;
  path: string;
  body?: unknown;
}

function capture(status = 200, responseBody = "{}") {
  const calls: Captured[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({
      method: init?.method ?? "GET",
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(responseBody, { status });
  }) as typeof fetch;
  const client = new PaveDBClient({
    baseUrl: "http://pavedb.test",
    apiKey: "pv_test",
    fetchImpl,
  });
  return { client, calls };
}

describe("route contract", () => {
  it("health and metrics", async () => {
    const { client, calls } = capture(200, '{"ok":true}');
    await client.health();
    await client.metricsSnapshot();
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ["GET", "/health"],
      ["GET", "/health/metrics"],
    ]);
  });

  it("admin surface", async () => {
    const { client, calls } = capture(200, '{"tenants":[]}');
    await client.listTenants();
    await client.listEmbedders();
    await client.getArchive();
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ["GET", "/v1/admin/tenants"],
      ["GET", "/v1/admin/embedders"],
      ["GET", "/v1/admin/archive"],
    ]);
  });

  it("collections: create is POST, never PUT", async () => {
    const { client, calls } = capture(200, "{}");
    await client.listCollections("acme");
    await client.createCollection("acme", "docs", {
      display_name: "Docs",
    });
    await client.deleteCollection("acme", "docs");
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ["GET", "/v1/collections/acme"],
      ["POST", "/v1/collections/acme/docs"],
      ["DELETE", "/v1/collections/acme/docs"],
    ]);
    expect(calls[1].body).toEqual({ display_name: "Docs" });
  });

  it("documents and search", async () => {
    const { client, calls } = capture(200, "{}");
    await client.addDocument("acme", "docs", { content: "hello" });
    await client.listDocuments("acme", "docs", 5);
    await client.search("acme", "docs", { query: "hello", top_k: 3 });
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ["POST", "/v1/collections/acme/docs/documents"],
      ["GET", "/v1/collections/acme/docs/documents?limit=5"],
      ["POST", "/v1/collections/acme/docs/search"],
    ]);
  });

  it("url-encodes tenant and collection names", async () => {
    const { client, calls } = capture(200, "{}");
    await client.search("a b", "c/d", { query: "x" });
    expect(calls[0].path).toBe("/v1/collections/a%20b/c%2Fd/search");
  });

  it("sends the bearer key on every call", async () => {
    let auth: string | null = null;
    const fetchImpl = (async (_: RequestInfo | URL, init?: RequestInit) => {
      auth = (init?.headers as Record<string, string>).authorization;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const client = new PaveDBClient({
      baseUrl: "http://pavedb.test",
      apiKey: "pv_secret",
      fetchImpl,
    });
    await client.health();
    expect(auth).toBe("Bearer pv_secret");
  });

  it("wraps error bodies in PaveDBError", async () => {
    const { client } = capture(405, '{"error":"method not allowed"}');
    await expect(client.createCollection("a", "b")).rejects.toMatchObject({
      name: "PaveDBError",
      status: 405,
      message: "method not allowed",
    });
    expect(new PaveDBError(500, "x", "y").code).toBe("x");
  });
});

describe("behavior", () => {
  it("normalizes trailing slashes off the base url", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const client = new PaveDBClient({
      baseUrl: "http://pavedb.test///",
      apiKey: "k",
      fetchImpl,
    });
    await client.health();
    expect(calls[0]).toBe("http://pavedb.test/health");
  });

  it("metrics returns raw prometheus text, not JSON", async () => {
    const body = "# HELP pavedb_up 1\npavedb_up 1\n";
    const fetchImpl = (async () =>
      new Response(body, { status: 200 })) as typeof fetch;
    const client = new PaveDBClient({
      baseUrl: "http://pavedb.test",
      apiKey: "k",
      fetchImpl,
    });
    expect(await client.metrics()).toBe(body);
  });

  it("version falls back to openapi info when /health lacks it", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/health") return new Response('{"ok":true}');
      if (path === "/openapi.json")
        return new Response('{"info":{"version":"9.9.9"}}');
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    const client = new PaveDBClient({
      baseUrl: "http://pavedb.test",
      apiKey: "k",
      fetchImpl,
    });
    expect(await client.version()).toBe("9.9.9");
  });

  it("tolerates a non-JSON success body", async () => {
    const fetchImpl = (async () =>
      new Response("plain text", { status: 200 })) as typeof fetch;
    const client = new PaveDBClient({
      baseUrl: "http://pavedb.test",
      apiKey: "k",
      fetchImpl,
    });
    expect(await client.health()).toBeNull();
  });

  it("wraps a non-JSON error body with the http status", async () => {
    const fetchImpl = (async () =>
      new Response("<html>bad gateway</html>", { status: 502 })) as typeof fetch;
    const client = new PaveDBClient({
      baseUrl: "http://pavedb.test",
      apiKey: "k",
      fetchImpl,
    });
    await expect(client.health()).rejects.toMatchObject({
      status: 502,
      code: "http_error",
    });
  });

  it("aborts when the timeout elapses", async () => {
    const fetchImpl = (async (_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason ?? new Error("aborted")),
        );
      })) as typeof fetch;
    const client = new PaveDBClient({
      baseUrl: "http://pavedb.test",
      apiKey: "k",
      fetchImpl,
      timeoutMs: 20,
    });
    await expect(client.health()).rejects.toThrow();
  });
});
