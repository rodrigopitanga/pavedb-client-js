// (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com>
// SPDX-License-Identifier: Apache-2.0

// Minimal, fetch-based client for the covered PaveDB 0.9.7 routes.

export interface PaveDBClientOptions {
  baseUrl: string;
  /** Tenant/admin bearer key; omit for public or caller-authenticated requests. */
  apiKey?: string;
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

export interface CollectionDetailResponse extends TraceResponse {
  tenant: string;
  name: string;
  display_name?: string | null;
  embedder_type?: string | null;
  embed_model?: string | null;
  embedder_config: Record<string, unknown>;
  vector_space_key?: string | null;
  search_mode: SearchMode;
  chunking?: Record<string, unknown> | null;
  priority_key: string;
  created_at?: string | null;
  pavedb_version?: string | null;
  schema_version?: number | null;
  doc_count: number;
  chunk_count: number;
  /** Successful chunk ingestions since PaveDB 0.9.8, including reuse. */
  chunks_indexed_total?: number;
  /** Ingested chunks whose current embeddings were reused (PaveDB 0.9.8+). */
  chunks_reused_total?: number;
}

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

export interface BatchIngestDocumentResult {
  ok: boolean;
  index: number;
  docid?: string | null;
  chunks?: number | null;
  error?: string | null;
  code?: string | null;
}

export interface BatchIngestDocumentsResponse extends TraceResponse {
  tenant: string;
  collection: string;
  documents: BatchIngestDocumentResult[];
  count: number;
  succeeded: number;
  failed: number;
}

export interface GetDocumentResponse extends TraceResponse, DocumentSummary {
  tenant: string;
  collection: string;
  metadata: Record<string, unknown>;
  chunk_ids: string[];
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
  private apiKey?: string;
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
    const res = await this.rawRequest(path, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
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

  /**
   * Instance-relative HTTP transport for proxies and binary endpoints.
   * Returns every HTTP status unchanged; only transport failures throw.
   * Explicit authorization headers override the configured bearer key.
   */
  rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
    if (!path.startsWith("/") || path.startsWith("//") ||
      /[\\\s#]/.test(path)) {
      throw new TypeError("Expected an instance-relative path");
    }
    const headers = new Headers(init.headers);
    if (this.apiKey && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${this.apiKey}`);
    }
    const timeout = AbortSignal.timeout(this.timeoutMs);
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      cache: init.cache ?? "no-store",
      redirect: "manual",
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
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

  /** Collection settings, live counts, and cumulative ingest/reuse totals. */
  getCollectionDetail(
    tenantName: string,
    name: string,
  ): Promise<CollectionDetailResponse> {
    return this.request(
      "GET",
      `/v1/collections/${enc(tenantName)}/${enc(name)}/detail`,
    );
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

  /** Batch ingest with per-document success and error results. */
  addDocuments(
    tenantName: string,
    collection: string,
    documents: DocumentInput[],
  ): Promise<BatchIngestDocumentsResponse> {
    return this.request(
      "POST",
      `/v1/collections/${enc(tenantName)}/${enc(collection)}/documents:batch`,
      { documents },
    );
  }

  /** Document metadata and chunk ids, absent from document summaries. */
  getDocument(
    tenantName: string,
    collection: string,
    docid: string,
  ): Promise<GetDocumentResponse> {
    return this.request(
      "GET",
      `/v1/collections/${enc(tenantName)}/${enc(collection)}/documents/${enc(docid)}`,
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
