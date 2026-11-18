-- Name suggestions (#231): keep the institution a person gave anywhere.
-- The account row comes first and often has no institution, while the registration
-- of the same person has one; the suggestion needs it to tell two namesakes apart.

CREATE OR REPLACE FUNCTION public.search_people(p_event_id uuid, p_query text, p_limit integer DEFAULT 6)
RETURNS TABLE (full_name text, email text, institution text)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  WITH needle AS (
    SELECT '%' || extensions.unaccent(lower(
      replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_')
    )) || '%' AS pattern
  ),
  people AS (
    SELECT u.full_name::text AS full_name, lower(u.email) AS email, u.institution::text AS institution, 1 AS source
      FROM users u
     WHERE u.full_name <> ''
    UNION ALL
    SELECT r.full_name::text, lower(r.email), r.institution::text, 2
      FROM pre_registrations r
     WHERE r.event_id = p_event_id AND r.deleted_at IS NULL
    UNION ALL
    SELECT a.full_name::text, lower(a.email), NULL::text, 3
      FROM submission_authors a
      JOIN submissions s ON s.id = a.submission_id
     WHERE s.event_id = p_event_id AND s.deleted_at IS NULL
  ),
  matched AS (
    SELECT p.email,
           (array_agg(p.full_name ORDER BY p.source))[1] AS full_name,
           (array_agg(p.institution ORDER BY p.source)
              FILTER (WHERE p.institution IS NOT NULL AND btrim(p.institution) <> ''))[1] AS institution
      FROM people p, needle n
     WHERE extensions.unaccent(lower(p.full_name)) LIKE n.pattern
     GROUP BY p.email
  )
  SELECT m.full_name, m.email, m.institution
    FROM matched m
   ORDER BY extensions.unaccent(lower(m.full_name)), m.email
   LIMIT LEAST(GREATEST(p_limit, 1), 20);
$$;

REVOKE ALL ON FUNCTION public.search_people(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_people(uuid, text, integer) TO service_role;
