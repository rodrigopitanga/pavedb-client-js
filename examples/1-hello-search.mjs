// (C) 2026 Rodrigo Rodrigues da Silva <rodrigo@flowlexi.com>
// SPDX-License-Identifier: Apache-2.0

// Example 1 — hello, search: collection, documents, a question.
import { PaveDBClient } from "../dist/index.js";

const db = new PaveDBClient({
  baseUrl: process.env.PAVEDB_BASE_URL,
  apiKey: process.env.PAVEDB_API_KEY,
});
const tenant = process.env.PAVEDB_TENANT;
const collection = `${tenant}-hello`;

await db.createCollection(tenant, collection, {
  display_name: "Hello search",
});

for (const text of [
  "PaveDB records every query so you can replay it later.",
  "The sandbox tenant lives on a shared instance and expires in 42 days.",
  "Semantic search matches meaning, not keywords.",
]) {
  await db.addDocument(tenant, collection, { text });
}

const res = await db.search(tenant, collection, {
  q: "how do I find things by meaning?",
  k: 2,
});
console.log(JSON.stringify(res, null, 2));
