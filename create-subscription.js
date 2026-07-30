// Serverless function — deploy as-is on Vercel at /api/create-subscription
// Requires: npm install razorpay @supabase/supabase-js

import Razorpay from 'razorpay';
import { createClient } from '@supabase/supabase-js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// service_role key — server-side only, never send this to the browser
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, email } = req.body || {};
  if (!userId || !email) {
    return res.status(400).json({ error: 'Missing userId or email' });
  }

  try {
    // 1. Create (or reuse) a Razorpay customer for this shop
    const customer = await razorpay.customers.create({
      name: email,
      email,
      fail_existing: 0, // returns the existing customer if one already exists with this email
    });

    // 2. Create the subscription against your monthly plan
    const subscription = await razorpay.subscriptions.create({
      plan_id: process.env.RAZORPAY_PLAN_ID, // created once in the Razorpay dashboard
      customer_notify: 1,
      total_count: 120, // bill monthly for up to 10 years; cancelling stops future charges
      notes: { supabase_user_id: userId },
    });

    // 3. Save a pending record — the webhook flips this to 'active' once payment clears
    const { error } = await supabaseAdmin.from('subscriptions').upsert(
      {
        user_id: userId,
        razorpay_customer_id: customer.id,
        razorpay_subscription_id: subscription.id,
        status: 'pending',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) throw error;

    res.status(200).json({
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('create-subscription error:', err);
    res.status(500).json({ error: 'Could not create subscription' });
  }
}
