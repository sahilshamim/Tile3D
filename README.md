# Adding a monthly subscription to the Tile Room Planner

This uses two third-party services (both have free/low-cost tiers to start):
- **Supabase** — accounts (login) + database (who's subscribed) + hosting for the "backend"
- **Razorpay Subscriptions** — recurring monthly billing in INR

Everything else (the tile planner itself) stays exactly as it is — these files sit *in front of* it.

## Files in this folder
- `supabase-schema.sql` — run once in Supabase to create the subscriptions table
- `api/create-subscription.js` — serverless function: starts a new subscription for a shop
- `api/razorpay-webhook.js` — serverless function: Razorpay calls this automatically on payment/renewal/failure to keep your database in sync
- `index.html` — the login + paywall screen shop owners see before reaching the tool
- `.env.example` — the secret keys you'll need to set

## Setup order

### 1. Supabase (10 min)
1. Go to supabase.com → New project.
2. Settings → API → copy **Project URL**, **anon public key**, and **service_role key** (keep the service_role key secret, server-side only).
3. Authentication → Providers → make sure **Email** is on. Under Email templates you can leave defaults — this uses magic-link login (no passwords to manage).
4. SQL Editor → paste the contents of `supabase-schema.sql` → Run.

### 2. Razorpay (15–20 min)
1. Sign up at razorpay.com, complete KYC (required before you can go live — test mode works immediately for development).
2. Dashboard → Settings → API Keys → generate **Key Id** and **Key Secret**.
3. Subscriptions → Plans → New Plan → e.g. "Tile Planner Monthly", ₹999, billing cycle = monthly → copy the **Plan ID**.
4. Settings → Webhooks → Add new webhook:
   - URL: `https://YOUR-DOMAIN/api/razorpay-webhook`
   - Active events: `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`
   - Copy the **Webhook Secret** shown after saving.

### 3. Deploy (Vercel is easiest for this file layout)
1. Put this folder + your `tile-wall-planner.html` in one repo, with `index.html` and the `api/` folder at the root.
2. Push to GitHub, import into Vercel.
3. In Vercel → Settings → Environment Variables, add everything from `.env.example` with your real values.
4. Deploy. Vercel automatically turns `api/*.js` files into serverless endpoints at `/api/*`.

### 4. Wire up the frontend
1. In `index.html`, replace `YOUR_PROJECT` and `YOUR_SUPABASE_ANON_KEY` with your real Supabase URL/anon key (the anon key is safe to expose in frontend code — it only allows what your Row Level Security policies permit).
2. That's it — `index.html` is now the "front door": it logs the shop owner in, checks their subscription, and only then sends them to `tile-wall-planner.html`.

### 5. Optional but recommended: protect the tool file directly
Right now, someone who guesses/bookmarks the direct URL to `tile-wall-planner.html` could open it without going through the gate. The cleanest fix is to paste the same "check session + check subscription" block from `index.html` (the `init()`, `checkSubscription()` functions) into the very top of `tile-wall-planner.html` too, so it self-checks regardless of how someone arrives at it.

## How money flows, end to end
1. Shop owner enters their email on `index.html` → gets a magic login link → clicks it → logged in.
2. If they don't have an active subscription yet, they see a "Subscribe — ₹999/month" button.
3. Clicking it calls `api/create-subscription.js`, which creates a Razorpay subscription and opens Razorpay's Checkout popup.
4. They pay → Razorpay charges them monthly going forward automatically.
5. Razorpay calls `api/razorpay-webhook.js` on every activation/renewal/failure/cancellation — this is what actually flips their status to `active` (or back to `past_due`/`cancelled`) in Supabase. The webhook is the source of truth, not the checkout popup — checkout only tells you payment *started*.
6. Every time they open the tool, it re-checks Supabase for `status = 'active'`. Expired/cancelled shops see the paywall again instead of the tool.

## Costs to expect
- Supabase: free tier covers this comfortably for a while (auth + tiny database).
- Razorpay: no fixed monthly fee — they take a percentage per transaction (check their current published rate).
- Vercel: free tier is fine for low traffic.

## A note on legal/compliance
Not legal advice, but before charging real customers you'll want: Terms of Service, a refund/cancellation policy, a privacy policy (you're storing shop owner emails and tile photos), and — if invoicing Indian businesses — GST registration. Worth a short conversation with an accountant/CA before going live.
