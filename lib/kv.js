// Upstash Redis REST API helper
// All reads/writes go through here

const BASE_URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

async function upstash(command, ...args) {
  const url = `${BASE_URL}/${[command, ...args.map(a => encodeURIComponent(a))].join("/")}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.result ?? null;
}

async function upstashPost(body) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.result ?? null;
}

export async function kvGet(key) {
  const result = await upstash("GET", key);
  if (result === null) return null;
  try { return JSON.parse(result); } catch { return result; }
}

export async function kvSet(key, value) {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return upstashPost(["SET", key, str]);
}

export async function kvDel(key) {
  return upstashPost(["DEL", key]);
}

export async function kvKeys(pattern) {
  const result = await upstashPost(["KEYS", pattern]);
  return Array.isArray(result) ? result : [];
}
