/*
# Create campaigns table for Boost Tool

1. New Tables
- `campaigns`
  - `id` (uuid, primary key)
  - `page_id` (text, not null) — Facebook Page ID
  - `ad_account_id` (text, not null) — Facebook Ad Account ID
  - `post_id` (text, not null) — Facebook Post ID to boost
  - `link` (text) — optional destination link for LINK_CLICKS objective
  - `budget` (numeric, default 2) — daily budget amount
  - `duration` (integer, default 7) — campaign duration in days
  - `currency` (text, default 'USD') — currency code
  - `goal` (text, default 'LINK_CLICKS') — campaign objective
  - `countries` (text, default 'EG') — comma-separated country codes
  - `gender` (integer, default 0) — 0=all, 1=men, 2=women
  - `age_min` (integer, default 18) — minimum target age
  - `age_max` (integer, default 55) — maximum target age
  - `boost_id` (text) — returned boost ID from Facebook on success
  - `status` (text, default 'pending') — pending, success, error
  - `response_payload` (jsonb) — full GraphQL response for debugging
  - `error_message` (text) — error message if failed
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `campaigns`.
- Allow anon + authenticated full CRUD (single-tenant app, no sign-in).
*/

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  ad_account_id text NOT NULL,
  post_id text NOT NULL,
  link text,
  budget numeric NOT NULL DEFAULT 2,
  duration integer NOT NULL DEFAULT 7,
  currency text NOT NULL DEFAULT 'USD',
  goal text NOT NULL DEFAULT 'LINK_CLICKS',
  countries text NOT NULL DEFAULT 'EG',
  gender integer NOT NULL DEFAULT 0,
  age_min integer NOT NULL DEFAULT 18,
  age_max integer NOT NULL DEFAULT 55,
  boost_id text,
  status text NOT NULL DEFAULT 'pending',
  response_payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_campaigns" ON campaigns;
CREATE POLICY "anon_select_campaigns" ON campaigns FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_campaigns" ON campaigns;
CREATE POLICY "anon_insert_campaigns" ON campaigns FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_campaigns" ON campaigns;
CREATE POLICY "anon_update_campaigns" ON campaigns FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_campaigns" ON campaigns;
CREATE POLICY "anon_delete_campaigns" ON campaigns FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns (created_at DESC);
