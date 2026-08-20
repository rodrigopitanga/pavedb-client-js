<!-- (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Roadmap

Extracted 2026-08-20 from the flowlexi-console workspace package. The
console consumes the published artifact; parity with the core HTTP
surface is tracked here.

## Queue

- Parity with the `/v1` surface of PaveDB 0.9.5. Missing today:
  `queries` / `replay` (the receipts — flagship), collection `detail`,
  `chunks` and `chunks/content`, `documents:batch`, single-document
  get/delete, collection `move` and PATCH, archive PUT,
  `/v1/embedders/{tenant}`, global `/v1/search`.
- Typed responses: most methods return `Promise<unknown>`; type the
  payloads against the core OpenAPI (P1-69-adjacent: versioned docs for
  pavedb-site come from the same shapes).
- `documents:batch` in the console playground ingest loop (one
  round-trip instead of N sequential `addDocument` calls).
- Contract tests against a real PaveDB container in CI, like the
  examples job planned for the siblings (pavedb P1-66).
- GitHub mirror repo `rodrigopitanga/pavedb-client-ts` + first release
  announce. Owner action: create the repo on GitHub and make sure the
  fine-grained GITHUB_MIRROR_TOKEN covers it; then drop the
  `allow_failure` flags from mirror-github/announce-github in
  gitlab-ci.yml (the token cannot create repos — probed 2026-08-20).
