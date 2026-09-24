-- Supabase exposes the public schema through its REST API with the (public) anon key.
-- Without RLS, anyone with that key can read and write these tables. Enabling RLS with
-- no policies denies anon/authenticated entirely; the pipeline scripts connect as
-- postgres, which bypasses RLS.
ALTER TABLE raw_dealerships    ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_reviews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE classified_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealership_tiers   ENABLE ROW LEVEL SECURITY;

-- Views run with the owner's privileges by default, which would bypass the RLS above.
ALTER VIEW dealership_map SET (security_invoker = true);
