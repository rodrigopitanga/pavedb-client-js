// Minimal PaveDB REST client (admin + health surface used by the console).
// Zero dependencies, fetch-based, extractable to its own repo/package.
// Routes match PaveDB >= 0.9.x (`/v1` API prefix, unversioned /health).

export interface PaveDBClientOptions {
  baseUrl: string;
  /** Bearer token: tenant API key or instance admin key. */
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class PaveDBError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PaveDBError";
  }
}

export class PaveDBClient {
  private baseUrl: string;
  private apiKey: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(opts: PaveDBClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  /** Raw request: returns the response body as text (e.g. /metrics). */
  private async rawRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      let err: { code?: string; error?: string } = {};
      try {
        err = JSON.parse(text) as { code?: string; error?: string };
      } catch {
        /* non-JSON error body */
      }
      throw new PaveDBError(
        res.status,
        err.code ?? "http_error",
        err.error ?? `${method} ${path} failed with ${res.status}`,
      );
    }
    return text;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const text = await this.rawRequest(method, path, body);
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON success body */
    }
    return json as T;
  }

  // --- health / ops ---
  health(): Promise<{ status: string }> {
    return this.request("GET", "/health");
  }

  /** Prometheus exposition text — NOT JSON. */
  metrics(): Promise<string> {
    return this.rawRequest("GET", "/metrics");
  }

  /** Server version: /health carries it and is always on; the OpenAPI
   *  document is the fallback (docs may be disabled in production). */
  async version(): Promise<string> {
    try {
      const h = await this.request<{ version?: string } | null>(
        "GET",
        "/health",
      );
      if (h?.version) return h.version;
    } catch {
      /* fall through to openapi */
    }
    const spec = await this.request<{ info?: { version?: string } } | null>(
      "GET",
      "/openapi.json",
    );
    return spec?.info?.version ?? "unknown";
  }

  // --- admin surface (requires admin key) ---
  listTenants(): Promise<{ tenants: string[] }> {
    return this.request("GET", "/v1/admin/tenants");
  }

  listEmbedders(): Promise<unknown> {
    return this.request("GET", "/v1/admin/embedders");
  }

  getArchive(): Promise<unknown> {
    return this.request("GET", "/v1/admin/archive");
  }

  // --- tenant surface (tenant API key or admin key) ---
  listCollections(tenantName: string): Promise<unknown> {
    return this.request("GET", `/v1/collections/${enc(tenantName)}`);
  }

  createCollection(
    tenantName: string,
    name: string,
    options?: {
      display_name?: string;
      embed_model?: string;
      embedder_type?: string;
      embedder_config?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    // core accepts POST (201) on this path; PUT is 405
    return this.request(
      "POST",
      `/v1/collections/${enc(tenantName)}/${enc(name)}`,
      options ?? {},
    );
  }

  deleteCollection(tenantName: string, name: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/v1/collections/${enc(tenantName)}/${enc(name)}`,
    );
  }

  addDocument(
    tenantName: string,
    collection: string,
    body: { content: string; metadata?: Record<string, unknown> },
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/v1/collections/${enc(tenantName)}/${enc(collection)}/documents`,
      body,
    );
  }

  listDocuments(
    tenantName: string,
    collection: string,
    limit = 20,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/v1/collections/${enc(tenantName)}/${enc(collection)}/documents?limit=${limit}`,
    );
  }

  /** Admin-key counters + hardware snapshot (/health/metrics). */
  metricsSnapshot(): Promise<Record<string, unknown>> {
    return this.request("GET", "/health/metrics");
  }

  search(
    tenantName: string,
    collection: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/v1/collections/${enc(tenantName)}/${enc(collection)}/search`,
      body,
    );
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}
