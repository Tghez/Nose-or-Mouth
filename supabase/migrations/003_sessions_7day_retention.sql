CREATE OR REPLACE FUNCTION sessions_enforce_7day_retention()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.sessions
  WHERE user_id = NEW.user_id
    AND date < CURRENT_DATE - INTERVAL '6 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sessions_7day_retention
AFTER INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION sessions_enforce_7day_retention();
