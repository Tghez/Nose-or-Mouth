-- Collapse subscription_status to a plain free/pro flag instead of mirroring
-- Stripe's full status lifecycle (active/past_due/cancelled).
UPDATE public.profiles SET subscription_status = 'pro' WHERE subscription_status = 'active';
UPDATE public.profiles SET subscription_status = 'free' WHERE subscription_status <> 'pro';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check CHECK (subscription_status IN ('free', 'pro'));
