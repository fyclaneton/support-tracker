// POST /api/backfill-account
// Tags all saved threads with receivedBy based on their Gmail To: header
// Much more accurate than fetchedBy since it reads the actual recipient address

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { kvGet, kvSet } from "../../lib/kv";
import { google } from "googleapis";

export const config = { maxDuration: 60 };

function detectReceivedBy(headers) {
  const deliveredTo = headers.find(h => h.name === "Delivered-To")?.value || "";
  const to = headers.find(h => h.name === "To")?.value || "";
  const combined = (deliveredTo + " " + to).toLowerCase();
  if (combined.includes("i2rcnc")) return "info@i2rcnc.com";
  if (combined.includes("lanetonca")) {
    const match = (deliveredTo || to).match(/([a-zA-Z0-9._%+\-]+@lanetonca\.com)/i);
    return match ? match[1].toLowerCase() : "fuyangchang@lanetonca.com";
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: session.accessToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const savedIds = await kvGet("shared:saved-thread-ids");
    const ids = Array.isArray(savedIds) ? savedIds : [];

    let tagged = 0;
    let skipped = 0;

    // Process in batches of 5 (each requires a Gmail API call)
    const BATCH = 5;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      await Promise.all(batch.map(async id => {
        try {
          const thread = await kvGet(`thread:${id}`);
          if (!thread) return;

          // Skip if already tagged with receivedBy
          if (thread.receivedBy) { skipped++; return; }

          // Fetch just metadata from Gmail to get To: header
          let receivedBy = null;
          try {
            const gmailThread = await gmail.users.threads.get({
              userId: "me", id,
              format: "metadata",
              metadataHeaders: ["To", "Delivered-To"],
            });
            const firstMsg = gmailThread.data.messages?.[0];
            if (firstMsg) {
              receivedBy = detectReceivedBy(firstMsg.payload?.headers || []);
            }
          } catch {
            // Thread not in this Gmail account — use session email as fallback
            receivedBy = session.user?.email || null;
          }

          if (receivedBy) {
            await kvSet(`thread:${id}`, { ...thread, receivedBy });
            tagged++;
          }
        } catch {}
      }));
      if (i + BATCH < ids.length) await new Promise(r => setTimeout(r, 200));
    }

    return res.status(200).json({ ok: true, tagged, skipped, total: ids.length });
  } catch (err) {
    console.error("backfill error:", err);
    return res.status(500).json({ error: err.message });
  }
}
