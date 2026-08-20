<!-- (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

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
