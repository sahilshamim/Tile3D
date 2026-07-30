// Serverless function — deploy as-is on Vercel at /api/razorpay-webhook
// This is what Razorpay calls automatically on activation, renewal, failure, cancellation.
// It is the SOURCE OF TRUTH for subscription status — never trust the checkout
// popup's "success" callback alone, because payment can still fail after that.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Razorpay signs the raw request body, so we must read it unparsed
export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-razorpay-signature'];

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (expectedSignature !== signature) {
    console.warn('Razorpay webhook signature mismatch');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody);
  const subEntity = event.payload?.subscription?.entity;
  const subscriptionId = subEntity?.id;

  if (!subscriptionId) {
    // Not a subscription event we care about — acknowledge and exit
    return res.status(200).json({ received: true });
  }

  let status = null;
  if (event.event === 'subscription.activated' || event.event === 'subscription.charged') {
    status = 'active';
  } else if (event.event === 'subscription.pending' || event.event === 'subscription.halted') {
    status = 'past_due';
  } else if (event.event === 'subscription.cancelled' || event.event === 'subscription.completed') {
    status = 'cancelled';
  }

  if (status) {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status,
        current_period_end: subEntity.current_end
          ? new Date(subEntity.current_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('razorpay_subscription_id', subscriptionId);

    if (error) console.error('Failed to update subscription status:', error);
  }

  res.status(200).json({ received: true });
}
