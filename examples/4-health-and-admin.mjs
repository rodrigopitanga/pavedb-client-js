// (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com>
// SPDX-License-Identifier: Apache-2.0

// Example 4 — operating surface: health, metrics, tenants. The admin
// calls need the INSTANCE admin key, not a tenant key.
import { PaveDBClient } from "../dist/index.js";

const db = new PaveDBClient({
  baseUrl: process.env.PAVEDB_BASE_URL,
  apiKey: process.env.PAVEDB_ADMIN_KEY ?? process.env.PAVEDB_API_KEY,
});

console.log("health:", JSON.stringify(await db.health()));
console.log("version:", await db.version());

try {
  console.log("tenants:", JSON.stringify(await db.listTenants()));
  console.log(
    "metrics keys:",
    Object.keys(await db.metricsSnapshot()).join(", "),
  );
} catch (e) {
  console.log(`admin surface refused (${e.status}): a tenant key is enough
for everything else — the admin key belongs to the instance operator.`);
}
