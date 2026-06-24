// Shared junk detection
// Returns true if the email is definitely junk and should be discarded

const JUNK_FROM_EXACT_DOMAINS = [
  // Only block emails FROM these exact domains — not emails that mention them
  "shopify.com", "myshopify.com", "shopifyemail.com", "mail.shopify.com",
  "em.shopify.com", "shopify-email.com",
  "intuit.com", "qbo.intuit.com", "quickbooks.com",
  "klaviyo.com", "klaviyo-email.com",
  "mailchimp.com", "mandrill.com",
  "sendgrid.net", "sendgrid.com",
  "constantcontact.com",
  "hubspot.com", "hs-email.com", "hubspotemail.net",
  "activecampaign.com",
  "campaignmonitor.com",
  "omnisend.com",
  "brevo.com", "sendinblue.com",
  "mailercloud.com", "mailerlite.com",
  "drip.com",
  "convertkit.com",
  "paypal.com", "paypalobjects.com",
  "stripe.com",
  "square.com", "squareup.com",
  "fedex.com", "fedex.net",
  "ups.com",
  "usps.com",
  "dhl.com",
  "shipstation.com", "easypost.com", "aftership.com",
  "amazon.com", "amazon.co.uk",
  "ebay.com",
  "alibaba.com", "aliexpress.com",
  "squarespace.com",
  "wix.com",
  "godaddy.com",
  "zendesk.com",
  "freshdesk.com",
  "xero.com",
  "hellorep.ai",
  "apollo.io",
  "salesloft.com",
  "outreach.io",
  "instantly.ai",
  "smartlead.ai",
  "woodpecker.co",
  "mailshake.com",
  "lemlist.com",
  "reply.io",
  "spocket.co",
  "mailgun.com", "mailgun.net",
];

const JUNK_FROM_PATTERNS = [
  // Pattern matches anywhere in the from address
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "mailer-daemon", "postmaster@",
  "bounce@", "bounces@", "mailer@",
  "notifications@", "notification@",
  "billing@", "invoice@", "receipts@", "payments@",
  "campaigns@", "marketing@", "promo@", "deals@", "offers@",
  "newsletter@", "unsubscribe@",
  "alerts@", "alert@",
  "support@shopify", "info@shopify",
];

const JUNK_SUBJECT = [
  // Sales/marketing
  "% off", "free shipping", "special offer", "limited time", "act now",
  "expires soon", "flash sale", "coupon", "promo code", "buy now",
  "score free", "exclusive deal", "today only",
  // Events / cold outreach
  "webinar", "summit", "cohort", "workshop", "bootcamp",
  "masterclass", "conference", "event invitation", "virtual event",
  "thought you might", "mutual connection", "quick question",
  "just checking in", "last attempt", "i wanted to reach out",
  "growth strategy", "scale your", "boost your", "increase your revenue",
  "suppliers alert", "new suppliers", "supplier network",
  "business opportunity", "affiliate", "commission",
  "partnership opportunity", "collaboration request",
  "military spouse", "veteran business", "small business grant",
  "funding opportunity",
  // Shopify system emails (NOT customer emails)
  "shopify store settings", "store notification", "new order from your store",
  "abandoned checkout", "your shopify", "shopify payments",
  // Accounting
  "quickbooks sync", "connector summary", "sync summary", "sync completed",
  "quickbooks connector",
  // Transactional / automated
  "invoice #", "receipt for", "payment received", "payment confirmation",
  "your invoice", "billing statement", "your receipt",
  "your order has", "order confirmed", "order shipped", "order delivered",
  "shipping confirmation", "tracking number", "out for delivery",
  "password reset", "verify your email", "confirm your email",
  "confirm your account", "security alert", "login attempt",
  "two-factor", "2fa code", "account suspended", "account locked",
  "out of office", "auto-reply", "automatic reply",
  "i am away", "i am out", "on vacation", "on leave",
  // Newsletters
  "unsubscribe", "newsletter", "click here to unsubscribe",
  "view in browser", "email preferences",
];

const JUNK_SENDER_NAMES = [
  "noreply", "no reply", "do not reply", "mailer", "postmaster",
  "shopify", "quickbooks", "intuit", "klaviyo", "mailchimp",
  "sendgrid", "hubspot", "apollo", "salesloft", "hellorep",
  "spocket", "solidworks", "us commercial service",
  "mailer-daemon",
];

function extractDomain(email) {
  const match = (email || "").match(/@([a-zA-Z0-9.\-]+)/);
  return match ? match[1].toLowerCase() : "";
}

// Your own company domains — internal emails are not customer support
const INTERNAL_DOMAINS = ["lanetonca.com", "i2rcnc.com"];

export function isDefiniteJunk(fromHeader, subject, senderName) {
  const from = (fromHeader || "").toLowerCase();
  const sub  = (subject || "").toLowerCase();
  const name = (senderName || "").toLowerCase();

  // ── WHITELIST — always allow these through regardless of other rules ──
  // Shopify contact form submissions — real customer inquiries routed via Shopify
  if (from.includes("mailer@shopify.com") && name.includes("shopify")) return false;
  if (name.includes("i2r") && name.includes("shopify")) return false;

  // ── Block internal company emails ──
  if (INTERNAL_DOMAINS.some(d => from.includes(`@${d}`))) return true;

  // Check exact domain matches — most precise, avoids false positives
  const domain = extractDomain(from);
  if (JUNK_FROM_EXACT_DOMAINS.some(d => domain === d || domain.endsWith("." + d))) return true;

  // Check from address patterns
  if (JUNK_FROM_PATTERNS.some(p => from.includes(p))) return true;

  // Check sender display name
  if (JUNK_SENDER_NAMES.some(p => name.includes(p))) return true;

  // Check subject patterns
  if (JUNK_SUBJECT.some(p => sub.includes(p))) return true;

  // 2+ emoji in subject = almost always marketing
  const emojiCount = (subject || "").match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu)?.length || 0;
  if (emojiCount >= 2) return true;

  return false;
}
