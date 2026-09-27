<!-- (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

## 0.2.1 — Unreleased

- Add typed tenant provisioning, live quota, and key lifecycle methods for PaveDB 1.0.

- Add typed collection detail, including optional ingest/reuse totals from
  PaveDB 0.9.8.

- Add typed batch ingest and document detail methods for Cloud ingestion and
  metadata inspection.
- Add `rawRequest` for proxy and binary transport, preserving HTTP status,
  response headers and streaming bodies. Restrict paths to the configured
  instance, disable redirects, and combine caller cancellation with timeouts.
- Require Node >= 20.3 for combined abort signals.
- Allow public health checks without a key. Explicit authorization overrides
  the configured bearer key; requests default to `cache: "no-store"`.

## 0.2.0 — 2026-09-26

### Breaking Changes
- `addDocument` now takes `{ text, docid?, metadata? }` or a raw
  `{ vector, docid?, metadata? }`. The old `content` field was rejected by
  PaveDB 0.9.7.
- `search` now takes `q` or `v`, with `k` for the hit count. The old
  `query` and `top_k` fields were ignored by the server.
- `listDocuments` no longer takes a limit. PaveDB returns the full list
  and ignored the client's `limit` query parameter.
- `getArchive` returns the raw ZIP `Response`. Read its body as a stream
  or `Blob`, and check `X-PaveDB-Skipped-Collections` before relying on it.
- JSON endpoints now reject malformed success bodies instead of returning
  `null`; `version` reads the version from `/health` only.

### SDK
- Add typed request and response shapes for covered PaveDB 0.9.7 routes.
- Support `embedder`, `search_mode`, `chunking`, and `priority_key` when
  creating a collection.
- Correct the runnable examples to use the server's ingest and search fields.

---

## 0.1.3 — 2026-08-21

### Infrastructure
- Rename the JavaScript client and ready npmjs release

---

# Changelog

## 0.1.2 — 2026-08-20

- `default` export condition: `require()` works on Node >= 22
  (require-of-ESM); `import` remains the path on Node 20.


## 0.1.1 — 2026-08-20

- Ship docs/reference and examples inside the tarball (pavedb-site
  ingests client releases from the published artifact).
- Declare the Node >= 20 engine; real project id in the README.


## 0.1.0 — 2026-08-20

- Extracted from the flowlexi-console workspace as a standalone package.
- Health, metrics, admin (tenants/embedders/archive), collections
  (list/create/delete), documents (add/list), and search — the surface
  the Flowlexi Cloud console and playground run on.
- Contract test suite pinning every method to its documented HTTP route
  (create is POST — the drift class that once 405'd in production).
- Generated markdown API reference; house build/release tooling.
