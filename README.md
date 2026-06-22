# i2R Support Tracker

A web app that pulls customer support emails from Gmail, categorizes them by issue type, and displays them in a searchable dashboard. Your team logs in with Google and sees threads from both the shared inbox and their own account.

---

## Deploy in 3 steps (~15 minutes total)

### Step 1 — Set up Google OAuth (5 min)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "Support Tracker")
3. Go to **APIs & Services → OAuth consent screen**
   - Choose **External**
   - Fill in App name, support email, developer email → Save
   - Under **Scopes**, add: `gmail.readonly`
   - Under **Test users**, add each team member's Gmail address
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://your-app.vercel.app/api/auth/callback/google`
     *(replace with your actual Vercel URL — you can update this after deploying)*
5. Copy the **Client ID** and **Client Secret** — you'll need them in Step 3

Also enable the Gmail API:
- Go to **APIs & Services → Library**
- Search for "Gmail API" and click **Enable**

---

### Step 2 — Push to GitHub (2 min)

```bash
cd support-tracker
git init
git add .
git commit -m "initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/support-tracker.git
git push -u origin main
```

---

### Step 3 — Deploy on Vercel (5 min)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New Project** → import your `support-tracker` repo
3. Under **Environment Variables**, add these 4 values:

| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | From Step 1 |
| `GOOGLE_CLIENT_SECRET` | From Step 1 |
| `NEXTAUTH_SECRET` | Any random string (e.g. run `openssl rand -base64 32` in terminal) |
| `NEXTAUTH_URL` | Your Vercel URL, e.g. `https://support-tracker-abc.vercel.app` |

4. Click **Deploy** — done! You'll get a shareable URL.

5. Go back to Google Cloud → Credentials → your OAuth client and add the redirect URI:
   `https://your-actual-vercel-url.vercel.app/api/auth/callback/google`

---

## Adding team members

Since the app is in "testing" mode on Google Cloud, you need to manually add each team member as a test user:

- Go to **APIs & Services → OAuth consent screen → Test users**
- Add their Gmail addresses

When you're ready to open it up more broadly, you can publish the app (click "Publish App" on the consent screen).

---

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in your values in .env.local
# Set NEXTAUTH_URL=http://localhost:3000
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)
