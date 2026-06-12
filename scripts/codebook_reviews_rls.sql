-- RLS for codebook_reviews (researcher frontend + pipeline).
-- Run in Supabase SQL editor if policies are missing.

ALTER TABLE public.codebook_reviews ENABLE ROW LEVEL SECURITY;

-- Pipeline / public load: anon can read rows (queue + editor before sign-in).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.codebook_reviews'::regclass
      AND polname = 'Allow public read codebook_reviews'
  ) THEN
    CREATE POLICY "Allow public read codebook_reviews"
    ON public.codebook_reviews
    FOR SELECT
    TO anon
    USING (true);
  END IF;
END $$;

-- Signed-in submit: authenticated must SELECT rows for UPDATE ... RETURNING.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.codebook_reviews'::regclass
      AND polname = 'Allow authenticated read codebook_reviews'
  ) THEN
    CREATE POLICY "Allow authenticated read codebook_reviews"
    ON public.codebook_reviews
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;

-- Approve / cancel pending reviews.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.codebook_reviews'::regclass
      AND polname = 'Allow authenticated update codebook_reviews'
  ) THEN
    CREATE POLICY "Allow authenticated update codebook_reviews"
    ON public.codebook_reviews
    FOR UPDATE
    TO authenticated
    USING (status = 'pending_review')
    WITH CHECK (status IN ('approved', 'cancelled'));
  END IF;
END $$;
