<!-- (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# PaveDB JavaScript / TypeScript Client

Minimal JavaScript / TypeScript client for the
[PaveDB](https://pavedb.org) REST API. Zero runtime dependencies,
`fetch`-based, works in Node >= 20.3 and any runtime with WHATWG `fetch`.
Routes match PaveDB 0.9.7 (`/v1` API prefix, unversioned `/health`).

## Install

```sh
npm install @flowlexi/pavedb-client
```

Works with plain JavaScript (`import` on Node >= 20.3, `require` on
Node >= 22) — the TypeScript types come along for free.

Every release is also published to this project's GitLab npm registry;
to install from there instead, point the scope at it:

```sh
echo "@flowlexi:registry=https://gitlab.com/api/v4/projects/85574851/packages/npm/" >> .npmrc
```

## Use

Set `PAVEDB_BASE_URL` to the connection URL shown in your Cloud dashboard
(`https://<instance-slug>-<account>-vector.flxcloud.cc`) or your own server.

```ts
import { PaveDBClient } from "@flowlexi/pavedb-client";

const db = new PaveDBClient({
  baseUrl: process.env.PAVEDB_BASE_URL!,
  apiKey: process.env.PAVEDB_API_KEY!,
});

await db.addDocument("acme", "docs", { text: "PaveDB keeps receipts." });
const hits = await db.search("acme", "docs", { q: "receipts", k: 3 });
```

`addDocuments(tenant, collection, documents)` ingests a batch and returns
per-document outcomes. `getDocument(tenant, collection, docid)` includes
metadata and chunk ids that document summaries omit.

For reverse proxies or binary endpoints, `rawRequest(path, init)` returns the
original `Response`, including non-success statuses. It accepts only paths
starting with `/` on the configured instance and never follows redirects.
Explicit authorization headers override `apiKey`; omit the key for public
health checks or when forwarding caller credentials. Requests are uncached by
default, with client timeouts and optional caller cancellation. Typed methods
continue to throw `PaveDBError` on unsuccessful HTTP responses.

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
