// Example 2 — metadata on ingest, filters on search.
import { PaveDBClient } from "../dist/index.js";

const db = new PaveDBClient({
  baseUrl: process.env.PAVEDB_BASE_URL,
  apiKey: process.env.PAVEDB_API_KEY,
});
const tenant = process.env.PAVEDB_TENANT;
const collection = `${tenant}-policies`;

await db.createCollection(tenant, collection, {
  display_name: "Policies by department",
});

const policies = [
  { dept: "hr", content: "Remote employees get a yearly equipment stipend." },
  { dept: "hr", content: "Core hours are 10:00 to 16:00 local time." },
  { dept: "sec", content: "Client data never lands on personal devices." },
];
for (const p of policies) {
  await db.addDocument(tenant, collection, {
    content: p.content,
    metadata: { dept: p.dept },
  });
}

const res = await db.search(tenant, collection, {
  query: "what do I get for my home office?",
  top_k: 3,
  filters: { dept: "hr" },
});
console.log(JSON.stringify(res, null, 2));
