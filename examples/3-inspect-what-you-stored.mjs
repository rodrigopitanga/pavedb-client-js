// (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com>
// SPDX-License-Identifier: Apache-2.0

// Example 3 — the store is inspectable: list what it holds, then clean up.
import { PaveDBClient } from "../dist/index.js";

const db = new PaveDBClient({
  baseUrl: process.env.PAVEDB_BASE_URL,
  apiKey: process.env.PAVEDB_API_KEY,
});
const tenant = process.env.PAVEDB_TENANT;
const collection = `${tenant}-inspect`;

await db.createCollection(tenant, collection);
await db.addDocument(tenant, collection, {
  content: "Everything you store, you can see again — and take with you.",
});

console.log("collections:", JSON.stringify(await db.listCollections(tenant)));
console.log(
  "documents:",
  JSON.stringify(await db.listDocuments(tenant, collection, 10), null, 2),
);

await db.deleteCollection(tenant, collection);
console.log("cleaned up", collection);
