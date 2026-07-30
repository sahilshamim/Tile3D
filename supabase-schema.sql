-- Run this once in the Supabase SQL Editor.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  razorpay_customer_id text,
  razorpay_subscription_id text unique,
  status text not null default 'inactive', -- inactive | pending | active | past_due | cancelled
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one subscription row per shop account
create unique index if not exists subscriptions_user_id_idx
  on public.subscriptions(user_id);

alter table public.subscriptions enable row level security;

-- Shop owners can read their OWN subscription status (needed by the frontend gate)
create policy "Users can read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- No insert/update policy for regular users on purpose.
-- Only the server-side service_role key (used in the serverless functions,
-- never exposed to the browser) is allowed to create or update subscription rows.
-- This stops a shop owner from editing their own row in the browser to grant
-- themselves free access.
