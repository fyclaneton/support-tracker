import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { google } from "googleapis";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize the Gemini AI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Smart Spam Blacklist
const SPAM_BLACKLIST = ["noreply@", "no-reply@", "billing@", "alert@", "newsletter@"];

async function analyzeTicketWithAI(snippet, subject) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze this support ticket subject and snippet:
      Subject: ${subject}
      Snippet: ${snippet}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { 
              type: Type.STRING, 
              enum: ["Software", "Hardware", "Setup", "Connectivity", "Contact request", "Other"] 
            },
            inquirySummary: { type: Type.STRING },
            recommendedFix: { type: Type.STRING }
          },
          required: ["category", "inquirySummary", "recommendedFix"],
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Analysis failed, falling back to defaults:", error);
    return {
      category: "Other",
      inquirySummary: snippet.slice(0, 120),
      recommendedFix: "Review manual logs."
    };
  }
}

function deriveStatus(labels, hasSentReply) {
  if (hasSentReply) return "Pending";
  return "Open";
}

function extractCustomer(messages) {
  for (const msg of messages) {
    const headers = msg.payload?.headers || [];
    const from = headers.find((h) => h.name === "From")?.value || "";
    if (
      from &&
      !from.includes("i2rcnc") &&
      !from.includes("noreply") &&
      !from.includes("no-reply")
    ) {
      const match = from.match(/^([^<]+)</);
      if (match) return match[1].trim();
      const emailMatch = from.match(/([^@\s]+@[^\s>]+)/);
      if (emailMatch) return emailMatch[1];
    }
  }
  return "Unknown";
}

function extractDate(messages) {
  if (!messages.length) return null;
  const headers = messages[0].payload?.headers || [];
  const date = headers.find((h) => h.name === "Date")?.value;
  if (!date) return null;
  try {
    return new Date(date).toISOString().split("T")[0];
  } catch {
    return null;
  }
}

function extractSubject(messages) {
  const headers = messages[0]?.payload?.headers || [];
  return (
    headers.find((h) => h.name === "Subject")?.value || "(no subject)"
  );
}

function getSnippet(messages) {
  for (const msg of messages) {
    if (msg.snippet && msg.snippet.length > 20) {
      return msg.snippet.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").slice(0, 200);
    }
  }
  return "";
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { pageToken, query } = req.query;

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const searchQuery =
      query ||
      'subject:(help OR "customer support" OR issue OR "not working" OR complaint OR problem OR setup OR error)';

    const listRes = await gmail.users.threads.list({
      userId: "me",
      q: searchQuery,
      maxResults: 20,
      pageToken: pageToken || undefined,
    });

    const threads = listRes.data.threads || [];
    const nextPageToken = listRes.data.nextPageToken || null;

    const detailed = await Promise.all(
      threads.map(async (t) => {
        try {
          const threadRes = await gmail.users.threads.get({
            userId: "me",
            id: t.id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          });

          const messages = threadRes.data.messages || [];
          
          // Smart Spam Filtering System
          const customerEmail = extractCustomer(messages);
          const isSpam = SPAM_BLACKLIST.some(spamTerm => customerEmail.toLowerCase().includes(spamTerm));
          if (isSpam) return null;

          const labels = messages.flatMap((m) => m.labelIds || []);
          const hasSentReply = labels.includes("SENT");
          const snippet = getSnippet(messages);
          const subject = extractSubject(messages);

          // Trigger True AI Insights
          const aiAnalysis = await analyzeTicketWithAI(snippet, subject);

          return {
            id: t.id,
            date: extractDate(messages),
            customer: customerEmail,
            subject: subject,
            snippet,
            category: aiAnalysis.category,
            inquirySummary: aiAnalysis.inquirySummary,
            recommendedFix: aiAnalysis.recommendedFix,
            status: deriveStatus(labels, hasSentReply),
            hasSent: hasSentReply,
            messageCount: messages.length,
          };
        } catch {
          return null;
        }
      })
    );

    const valid = detailed.filter(Boolean);

    return res.status(200).json({ threads: valid, nextPageToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
