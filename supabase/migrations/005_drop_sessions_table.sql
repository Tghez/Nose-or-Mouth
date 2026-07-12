-- Session history now lives locally on-device (src/main/utils/storage.ts),
-- pruned to the last 7 days. Nothing writes to public.sessions anymore.
DROP TRIGGER IF EXISTS sessions_7day_retention ON public.sessions;
DROP FUNCTION IF EXISTS sessions_enforce_7day_retention();
DROP TABLE IF EXISTS public.sessions;
