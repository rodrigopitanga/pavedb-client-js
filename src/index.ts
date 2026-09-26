// (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com>
// SPDX-License-Identifier: Apache-2.0

// Minimal, fetch-based client for the covered PaveDB 0.9.7 routes.

export interface PaveDBClientOptions {
  baseUrl: string;
  /** Bearer token: tenant API key or instance admin key. */
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface TraceResponse {
  ok?: true;
  request_id?: string | null;
  latency_ms?: number | null;
}

export interface HealthResponse {
  ok: boolean;
  status: "ready" | "degraded";
  version: string;
  request_id?: string | null;
  latency_ms?: number | null;
}

export interface ListTenantsResponse extends TraceResponse {
  tenants: string[];
  count: number;
}

export interface EmbedderInventoryEntry {
  key: string;
  vector_key: string;
  embedder_type: string;
  embed_model: string;
}

export interface EmbedderInventoryResponse extends TraceResponse {
  embedders: EmbedderInventoryEntry[];
  default: {
    selector?: string | null;
    vector_key: string;
    instance_keys: string[];
  };
  count: number;
  tenant?: string | null;
}

export interface CollectionSummary {
  name: string;
  display_name?: string | null;
  embedder_label?: string | null;
  vector_space_key?: string | null;
}

export interface ListCollectionsResponse extends TraceResponse {
  tenant: string;
  collections: CollectionSummary[];
  count: number;
}

export type SearchMode = "vector" | "boost" | "hybrid";

export type CreateCollectionOptions = {
  display_name?: string;
  search_mode?: SearchMode;
  chunking?: {
    strategy?: "fixed" | "none";
    size?: number;
    overlap?: number;
  };
  priority_key?: string;
} & (
  | {
      /** Configured selector; cannot be combined with detailed fields. */
      embedder?: string;
      embed_model?: never;
      embedder_type?: never;
      embedder_config?: never;
    }
  | {
      embedder?: never;
      embed_model?: string;
      embedder_type?: string;
      embedder_config?: Record<string, unknown>;
    }
);

export interface CreateCollectionResponse extends TraceResponse {
  tenant: string;
  name: string;
  collection: string;
  display_name: string;
  embedder_type: string;
  embed_model: string;
  embedder_config?: Record<string, unknown>;
  search_mode?: SearchMode;
  chunking?: Record<string, unknown> | null;
  priority_key?: string;
}

export interface DeleteCollectionResponse extends TraceResponse {
  tenant: string;
  deleted: string;
}

export type DocumentInput = {
  docid?: string;
  metadata?: Record<string, unknown>;
} & ({ text: string; vector?: never } | { vector: number[]; text?: never });

export interface IngestDocumentResponse extends TraceResponse {
  tenant: string;
  collection: string;
  docid: string;
  chunks: number;
}

export interface DocumentSummary {
  docid: string;
  version: number;
  ingested_at: string;
  chunk_count: number;
}

export interface ListDocumentsResponse extends TraceResponse {
  tenant: string;
  collection: string;
  documents: DocumentSummary[];
  count: number;
}

export type SearchBody = {
  k?: number;
  filters?: Record<string, unknown>;
  content_filter?: {
    op: "exact" | "phrase" | "prefix" | "contains";
    value: string;
  };
  mode?: SearchMode;
  include_common?: boolean;
} & ({ q: string; v?: never } | { v: number[]; q?: never });

export interface SearchResult {
  id: string;
  score: number;
  text: string | null;
  tenant: string;
  collection: string;
  meta: Record<string, unknown>;
  match_reason: string;
}

export interface SearchResponse extends TraceResponse {
  matches: SearchResult[];
  mode?: SearchMode | null;
  query_id?: string | null;
  timing?: {
    embed_ms: number;
    search_ms: number;
    filter_ms: number;
    hydrate_ms: number;
    vector_search_ms?: number | null;
    lexical_search_ms?: number | null;
  } | null;
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

  private async fetchResponse(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text();
      let err: { code?: string; error?: string } = {};
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          err = parsed as { code?: string; error?: string };
        }
      } catch {
        /* non-JSON error body */
      }
      throw new PaveDBError(
        res.status,
        err.code ?? "http_error",
        err.error ?? `${method} ${path} failed with ${res.status}`,
      );
    }
    return res;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return (await this.fetchResponse(method, path, body)).json() as Promise<T>;
  }

  // --- health / ops ---
  health(): Promise<HealthResponse> {
    return this.request("GET", "/health");
  }

  /** Prometheus exposition text, not JSON. */
  metrics(): Promise<string> {
    return this.fetchResponse("GET", "/metrics").then((res) => res.text());
  }

  /** Server version from the always-on health endpoint. */
  async version(): Promise<string> {
    const health = await this.request<HealthResponse>("GET", "/health");
    return health.version;
  }

  // --- admin surface (requires admin key) ---
  listTenants(): Promise<ListTenantsResponse> {
    return this.request("GET", "/v1/admin/tenants");
  }

  listEmbedders(): Promise<EmbedderInventoryResponse> {
    return this.request("GET", "/v1/admin/embedders");
  }

  /** ZIP response; inspect X-PaveDB-Skipped-Collections before using it. */
  getArchive(): Promise<Response> {
    return this.fetchResponse("GET", "/v1/admin/archive");
  }

  // --- tenant surface (tenant API key or admin key) ---
  listCollections(tenantName: string): Promise<ListCollectionsResponse> {
    return this.request("GET", `/v1/collections/${enc(tenantName)}`);
  }

  createCollection(
    tenantName: string,
    name: string,
    options?: CreateCollectionOptions,
  ): Promise<CreateCollectionResponse> {
    return this.request(
      "POST",
      `/v1/collections/${enc(tenantName)}/${enc(name)}`,
      options ?? {},
    );
  }

  deleteCollection(
    tenantName: string,
    name: string,
  ): Promise<DeleteCollectionResponse> {
    return this.request(
      "DELETE",
      `/v1/collections/${enc(tenantName)}/${enc(name)}`,
    );
  }

  addDocument(
    tenantName: string,
    collection: string,
    body: DocumentInput,
  ): Promise<IngestDocumentResponse> {
    return this.request(
      "POST",
      `/v1/collections/${enc(tenantName)}/${enc(collection)}/documents`,
      body,
    );
  }

  listDocuments(
    tenantName: string,
    collection: string,
  ): Promise<ListDocumentsResponse> {
    return this.request(
      "GET",
      `/v1/collections/${enc(tenantName)}/${enc(collection)}/documents`,
    );
  }

  /** Admin-key counters and hardware snapshot. */
  metricsSnapshot(): Promise<Record<string, unknown>> {
    return this.request("GET", "/health/metrics");
  }

  search(
    tenantName: string,
    collection: string,
    body: SearchBody,
  ): Promise<SearchResponse> {
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
