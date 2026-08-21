<!-- (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# PaveDB JavaScript / TypeScript Client

Minimal JavaScript / TypeScript client for the
[PaveDB](https://pavedb.org) REST API. Zero runtime dependencies,
`fetch`-based, works in Node >= 20 and any runtime with WHATWG `fetch`.
Routes match PaveDB >= 0.9.x (`/v1` API prefix, unversioned `/health`).

## Install

```sh
npm install @flowlexi/pavedb-client
```

Works with plain JavaScript (`import` on Node >= 20, `require` on
Node >= 22) — the TypeScript types come along for free.

Every release is also published to this project's GitLab npm registry;
to install from there instead, point the scope at it:

```sh
echo "@flowlexi:registry=https://gitlab.com/api/v4/projects/85574851/packages/npm/" >> .npmrc
```

## Use

```ts
import { PaveDBClient } from "@flowlexi/pavedb-client";

const db = new PaveDBClient({
  baseUrl: "https://sandbox.pavedb.org",
  apiKey: process.env.PAVEDB_API_KEY!,
});

await db.addDocument("acme", "docs", { content: "PaveDB keeps receipts." });
const hits = await db.search("acme", "docs", { query: "receipts", top_k: 3 });
```

The full surface is in [docs/reference/api.md](docs/reference/api.md)
(generated — `make docs`). Numbered, runnable walkthroughs live in
[examples/](examples/).

## Development

```sh
npm ci
make test         # typecheck + contract tests
make docs-check   # generated reference must be committed fresh
make release      # changelog + tarball; tag v<version> to publish
```

`VERSION` lives in package.json only. CI publishes to npmjs and to the
GitLab npm registry from a stable `vX.Y.Z` tag and mirrors the repo to
GitHub.

## License

Apache-2.0. PaveDB itself is a separate project — see pavedb.org.
