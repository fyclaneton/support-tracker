// Shared junk detection — used by threads.js, history.js, and bulk-import.js
// Returns true if the email is definitely junk and should be discarded

const JUNK_FROM = [
  // Accounting / ERP
  "quickbooks","intuit.com","qbo.intuit","xero.com","freshbooks",
  // E-commerce platforms
  "shopify","myshopify","shopifyemail","bigcommerce","woocommerce",
  // Marketing / email tools
  "klaviyo","mailchimp","sendgrid","constantcontact","hubspot","activecampaign",
  "campaignmonitor","omnisend","brevo.com","sendinblue",
  // No-reply patterns
  "noreply","no-reply","donotreply","do-not-reply","mailer-daemon","postmaster@",
  "bounce","bounces@","mailer@",
  // AI sales / cold outreach tools
  "hellorep","apollo.io","salesloft","outreach.io","reply.io","lemlist",
  "instantly.ai","smartlead","woodpecker","mailshake",
  // Shipping / logistics
  "fedex","ups.com","usps.com","dhl.com","shipstation","easypost","aftership",
  // Payment
  "paypal","stripe.com","square.com","braintree",
  // Other platforms
  "squarespace","wix.com","mailgun","twilio","zendesk",
  "amazon.com","ebay.com","alibaba","aliexpress",
  // Notification patterns
  "notifications@","notification@","alerts@","newsletter",
  "billing@","invoice@","receipts@","payments@","campaigns@",
  "marketing@","promo@","deals@","offers@",
  "info@shopify","support@shopify","em.shopify","mail.shopify",
];

const JUNK_SUBJECT = [
  // Sales/marketing
  "% off","free shipping","special offer","limited time","act now","expires soon",
  "flash sale","discount","coupon","promo code","buy now","score free",
  "unsubscribe","newsletter","webinar","summit","cohort","workshop",
  "bootcamp","masterclass","conference","event invitation","virtual event",
  // Finance/accounting
  "quickbooks sync","connector summary","sync summary","sync completed",
  "invoice #","receipt for","payment received","payment confirmation",
  "your invoice","billing statement","your receipt",
  // E-commerce automated
  "your order","order confirmed","order shipped","order delivered",
  "shipping confirmation","tracking number","out for delivery",
  "shopify store","store notification","new order from",
  // System automated
  "password reset","verify your email","confirm your email","confirm your account",
  "security alert","login attempt","two-factor","2fa code",
  "account suspended","account locked",
  // Cold outreach signals
  "quick question","just checking in","following up","last attempt",
  "i wanted to reach out","growth strategy","scale your","boost your",
  "increase your revenue","suppliers alert","new suppliers","supplier network",
  "business opportunity","affiliate","commission","partnership opportunity",
  "military spouse","veteran business","small business grant","funding opportunity",
  "thought you might","mutual connection",
  // Automated replies
  "out of office","auto-reply","automatic reply","i am away","i am out",
  "on vacation","on leave",
];

const JUNK_SENDER_NAMES = [
  "noreply","no reply","do not reply","mailer","postmaster",
  "shopify","quickbooks","intuit","klaviyo","mailchimp",
  "sendgrid","hubspot","apollo","salesloft","hellorep","spocket",
  "solidworks","us commercial service",
];

export function isDefiniteJunk(fromHeader, subject, senderName) {
  const from = (fromHeader || "").toLowerCase();
  const sub  = (subject || "").toLowerCase();
  const name = (senderName || "").toLowerCase();

  if (JUNK_FROM.some(p => from.includes(p))) return true;
  if (JUNK_SUBJECT.some(p => sub.includes(p))) return true;
  if (JUNK_SENDER_NAMES.some(p => name.includes(p))) return true;

  // Emails with multiple emoji in subject are almost always marketing
  const emojiCount = (subject || "").match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu)?.length || 0;
  if (emojiCount >= 2) return true;

  return false;
}
