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

  it("collection detail preserves counts and supports older servers", async () => {
    const info = { tenant: "acme", name: "docs", doc_count: 3, chunk_count: 5,
      chunks_indexed_total: 20, chunks_reused_total: 12 };
    const { client, calls } = capture(200, JSON.stringify(info));
    expect(await client.getCollectionDetail("acme/team", "docs")).toEqual(info);
    expect(calls[0]).toMatchObject({
      method: "GET", path: "/v1/collections/acme%2Fteam/docs/detail",
    });
    const legacy = capture(200, '{"doc_count":3,"chunk_count":5}');
    expect((await legacy.client.getCollectionDetail("acme", "docs"))
      .chunks_reused_total).toBeUndefined();
  });

  it("collections: create is POST with 0.9.7 options", async () => {
    const { client, calls } = capture(200, "{}");
    await client.listCollections("acme");
    await client.createCollection("acme", "docs", {
      display_name: "Docs",
      embedder: "native",
      search_mode: "hybrid",
      chunking: { strategy: "fixed", size: 1000, overlap: 200 },
      priority_key: "priority",
    });
    await client.deleteCollection("acme", "docs");
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ["GET", "/v1/collections/acme"],
      ["POST", "/v1/collections/acme/docs"],
      ["DELETE", "/v1/collections/acme/docs"],
    ]);
    expect(calls[1].body).toEqual({
      display_name: "Docs",
      embedder: "native",
      search_mode: "hybrid",
      chunking: { strategy: "fixed", size: 1000, overlap: 200 },
      priority_key: "priority",
    });
  });

  it("documents and search use the 0.9.7 payloads", async () => {
    const { client, calls } = capture(200, "{}");
    await client.addDocument("acme", "docs", {
      text: "hello",
      docid: "note-1",
      metadata: { lang: "en" },
    });
    await client.addDocument("acme", "docs", { vector: [0.1, 0.2] });
    await client.listDocuments("acme", "docs");
    await client.search("acme", "docs", {
      q: "hello",
      k: 3,
      mode: "hybrid",
      filters: { lang: "en" },
      content_filter: { op: "phrase", value: "hello" },
    });
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ["POST", "/v1/collections/acme/docs/documents"],
      ["POST", "/v1/collections/acme/docs/documents"],
      ["GET", "/v1/collections/acme/docs/documents"],
      ["POST", "/v1/collections/acme/docs/search"],
    ]);
    expect(calls[0].body).toEqual({
      text: "hello",
      docid: "note-1",
      metadata: { lang: "en" },
    });
    expect(calls[1].body).toEqual({ vector: [0.1, 0.2] });
    expect(calls[3].body).toEqual({
      q: "hello",
      k: 3,
      mode: "hybrid",
      filters: { lang: "en" },
      content_filter: { op: "phrase", value: "hello" },
    });
  });

  it("url-encodes tenant and collection names", async () => {
    const { client, calls } = capture(200, "{}");
    await client.search("a b", "c/d", { q: "x" });
    expect(calls[0].path).toBe("/v1/collections/a%20b/c%2Fd/search");
  });

  it("sends the bearer key on every call", async () => {
    let auth: string | null = null;
    const fetchImpl = (async (_: RequestInfo | URL, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization");
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

  it("reads the version from the always-on health endpoint", async () => {
    const { client, calls } = capture(200, '{"version":"0.9.7"}');
    expect(await client.version()).toBe("0.9.7");
    expect(calls.map((c) => c.path)).toEqual(["/health"]);
  });

  it("rejects a non-JSON success body for a JSON endpoint", async () => {
    const fetchImpl = (async () =>
      new Response("plain text", { status: 200 })) as typeof fetch;
    const client = new PaveDBClient({
      baseUrl: "http://pavedb.test",
      apiKey: "k",
      fetchImpl,
    });
    await expect(client.health()).rejects.toThrow();
  });

  it("returns archive bytes and the skipped-collections header", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const fetchImpl = (async () =>
      new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "X-PaveDB-Skipped-Collections": "bad-collection",
        },
      })) as typeof fetch;
    const client = new PaveDBClient({
      baseUrl: "http://pavedb.test",
      apiKey: "k",
      fetchImpl,
    });
    const response = await client.getArchive();
    expect(response.headers.get("X-PaveDB-Skipped-Collections"))
      .toBe("bad-collection");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
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


describe("console transport and document contracts", () => {
  it("gets document metadata and sends batch text/vector inputs", async () => {
    const { client, calls } = capture(200, "{}");
    await client.getDocument("a b", "c/d", "doc/1");
    const documents = [
      { text: "hello", metadata: { source: "notes" } },
      { vector: [0.1, 0.2], docid: "vector-1" },
    ];
    await client.addDocuments("a b", "c/d", documents);
    expect(calls).toEqual([
      { method: "GET", path: "/v1/collections/a%20b/c%2Fd/documents/doc%2F1" },
      {
        method: "POST", path: "/v1/collections/a%20b/c%2Fd/documents:batch",
        body: { documents },
      },
    ]);
  });

  it("preserves raw bytes, caller auth, query and HTTP errors", async () => {
    let received: RequestInit | undefined;
    let url: string | undefined;
    const response = new Response(new Uint8Array([80, 75, 3, 4]), {
      status: 429,
      headers: { "retry-after": "60", "content-type": "application/zip" },
    });
    const client = new PaveDBClient({
      baseUrl: "https://pavedb.test", apiKey: "default-key",
      fetchImpl: (async (input, init) => {
        url = String(input);
        received = init;
        return response;
      }) as typeof fetch,
    });
    const bytes = new Uint8Array([80, 75, 3, 4]);
    const result = await client.rawRequest("/v1/archive?restore=true", {
      method: "PUT", body: bytes,
      headers: { authorization: "Bearer caller-key" },
    });
    expect(result).toBe(response);
    expect(result.status).toBe(429);
    expect(result.headers.get("retry-after")).toBe("60");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
    expect(url).toBe("https://pavedb.test/v1/archive?restore=true");
    expect(received?.body).toBe(bytes);
    expect(new Headers(received?.headers).get("authorization"))
      .toBe("Bearer caller-key");
    expect(new Headers(received?.headers).has("content-type")).toBe(false);
    expect(received?.redirect).toBe("manual");
    expect(received?.cache).toBe("no-store");
  });

  it("omits credentials for public health", async () => {
    const client = new PaveDBClient({
      baseUrl: "https://pavedb.test",
      fetchImpl: (async (_input, init) => {
        expect(new Headers(init?.headers).has("authorization")).toBe(false);
        return Response.json({ ok: true, version: "0.9.7", status: "ready" });
      }) as typeof fetch,
    });
    expect((await client.health()).ok).toBe(true);
  });

  it.each([
    "https://elsewhere.test", "//elsewhere.test/path", "relative/path",
    "/\\elsewhere.test", "/health\n", "/health#fragment",
  ])("rejects paths that can escape the instance: %s", (path) => {
    const { client, calls } = capture();
    expect(() => client.rawRequest(path)).toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it("honors caller cancellation as well as the client timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new PaveDBClient({
      baseUrl: "https://pavedb.test",
      fetchImpl: (async (_input, init) => {
        expect(init?.signal?.aborted).toBe(true);
        init?.signal?.throwIfAborted();
        return Response.json({});
      }) as typeof fetch,
    });
    await expect(client.rawRequest("/health", { signal: controller.signal }))
      .rejects.toThrow();
  });
});


describe("tenant provisioning", () => {
  it("maps lifecycle and keys, preserving null inheritance", async () => {
    const { client, calls } = capture();
    await client.createTenant("acme", { create_key: false, limits: { max_rpm: 0 } });
    await client.getTenant("acme");
    await client.updateTenant("acme", { limits: { max_rpm: null } });
    await client.createTenantKey("acme", "rotation");
    await client.listTenantKeys("acme");
    await client.revokeTenantKey("acme", "key/id");
    await client.deleteTenant("acme");
    expect(calls.map(({ method, path }) => [method, path])).toEqual([
      ["POST", "/v1/admin/tenants"],
      ["GET", "/v1/admin/tenants/acme"],
      ["PATCH", "/v1/admin/tenants/acme"],
      ["POST", "/v1/admin/tenants/acme/keys"],
      ["GET", "/v1/admin/tenants/acme/keys"],
      ["DELETE", "/v1/admin/tenants/acme/keys/key%2Fid"],
      ["DELETE", "/v1/admin/tenants/acme"],
    ]);
    expect(calls[0].body).toEqual({
      tenant: "acme", create_key: false, limits: { max_rpm: 0 },
    });
    expect(calls[2].body).toEqual({ limits: { max_rpm: null } });
    expect(calls[3].body).toEqual({ label: "rotation" });
  });
});
