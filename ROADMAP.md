<!-- (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Roadmap

Extracted 2026-08-20 from the flowlexi-console workspace package. The
console consumes the published artifact; parity with the core HTTP
surface is tracked here.

## Queue

- Parity with the `/v1` surface of PaveDB 0.9.5. Missing today:
  `queries` / `replay` (the receipts — flagship),
  `chunks` and `chunks/content`, single-document
  delete, collection `move` and PATCH, archive PUT,
  `/v1/embedders/{tenant}`, global `/v1/search`.
- PaveDB 0.9.7 routes: collection archive GET/POST/PUT (admin and
  self-service) and reindex jobs (start, get, cancel, pause/resume).
- Type request and response payloads for future parity routes against
  the core OpenAPI (P1-69-adjacent: versioned docs for pavedb-site come
  from the same shapes).
- Added in 0.2.1: collection detail, `documents:batch`, document get, and raw response
  transport for the Console data plane. Console consumes these methods for
  batch ingestion, metadata discovery, and proxy requests.
- Contract tests against a real PaveDB container in CI, like the
  examples job planned for the siblings (pavedb P1-66).
