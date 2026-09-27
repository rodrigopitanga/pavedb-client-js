<!-- (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Examples

Numbered, runnable walkthroughs. Each is a single Node >= 20.3 script with
no dependencies beyond the client. Point them at any PaveDB — the free
sandbox at cloud.flowlexi.com works. Copy its instance connection URL from
the dashboard; hosted PaveDB connections use flxcloud.cc:


```sh
export PAVEDB_BASE_URL="https://<instance-slug>-<account>-vector.flxcloud.cc"
export PAVEDB_API_KEY="pv_..."          # your tenant key
export PAVEDB_TENANT="your-tenant-name"
npm ci && npm run build
node examples/1-hello-search.mjs
```

1. **hello-search** — create a collection, add documents, search in
   plain words.
2. **metadata-filters** — attach metadata on ingest, narrow a search by
   field.
3. **inspect-what-you-stored** — list documents and see exactly what the
   store holds; delete the collection when done.
4. **health-and-admin** — instance health, metrics snapshot, and the
   admin surface (requires the instance admin key).
