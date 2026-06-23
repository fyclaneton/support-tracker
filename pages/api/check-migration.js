import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet } from "../../lib/kv";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  try {
    const done = await kvGet("shared:migration-models-v1");
    return res.status(200).json({ done: !!done });
  } catch {
    return res.status(200).json({ done: false });
  }
}
