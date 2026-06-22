import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { threads } = req.body;

  // We'll generate a simple HTML-based PDF using a data string
  // that the frontend will print. Return structured data for client-side PDF gen.
  return res.status(200).json({ threads, generatedAt: new Date().toISOString() });
}
