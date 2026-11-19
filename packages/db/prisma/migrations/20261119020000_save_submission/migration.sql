-- A paper and its authors are written in one step, and the edital's limits are counted
-- inside it (ADR-010, decision 8; #345).
--
-- Until now the server counted the limits, then wrote the paper, then deleted and wrote its
-- authors: three requests. Two saves at the same moment could both pass the count, and a
-- change that failed half way left a paper with no authors. Here the people of the paper
-- are locked first, the limits are counted for each of them over the papers that stand,
-- and only then is anything written, all in the same transaction.
--
-- p_authors: [{ position, fullName, email, cpf, passport, country,
--               emails: [...], cpfs: [...], passports: ["CC:NUMBER", ...] }]
-- The three lists are everything the server knows about who the person is (the line itself
-- and the account behind it): a paper counts for a person when one of its lines has any of
-- them. The place a person holds in a paper is the first of their lines in it.
--
-- Returns { "id": <uuid> } when written, or { "refused": <reason>, "position": <n> } with
-- nothing written: too_many_as_main, coauthor_limit, submission_not_found.
CREATE OR REPLACE FUNCTION public.save_submission(
  p_id uuid,
  p_event_id uuid,
  p_user_id uuid,
  p_fields jsonb,
  p_authors jsonb,
  p_max_as_main integer,
  p_max_as_coauthor integer,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  lock_key text;
  author jsonb;
  place integer;
  as_main integer;
  as_coauthor integer;
  saved_id uuid := p_id;
  stamp timestamp(3) := p_now AT TIME ZONE 'UTC';
BEGIN
  -- Everyone in the paper, by everything that says who they are, always in the same order:
  -- two saves that share a person wait for each other, and never lock in a circle.
  FOR lock_key IN
    SELECT DISTINCT k
      FROM jsonb_array_elements(p_authors) a
     CROSS JOIN LATERAL (
            SELECT 'e:' || v AS k FROM jsonb_array_elements_text(COALESCE(a -> 'emails', '[]'::jsonb)) v
            UNION ALL
            SELECT 'c:' || v FROM jsonb_array_elements_text(COALESCE(a -> 'cpfs', '[]'::jsonb)) v
            UNION ALL
            SELECT 'p:' || v FROM jsonb_array_elements_text(COALESCE(a -> 'passports', '[]'::jsonb)) v
          ) keys
     ORDER BY k
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text || '|' || lock_key, 0));
  END LOOP;

  FOR author IN SELECT * FROM jsonb_array_elements(p_authors) LOOP
    place := (author ->> 'position')::integer;
    WITH held AS (
      SELECT s.id, min(a.position) AS first_line
        FROM submissions s
        JOIN submission_authors a ON a.submission_id = s.id
       WHERE s.event_id = p_event_id
         AND s.deleted_at IS NULL
         AND (p_id IS NULL OR s.id <> p_id)
         AND (
              a.email IN (SELECT jsonb_array_elements_text(COALESCE(author -> 'emails', '[]'::jsonb)))
           OR a.cpf IN (SELECT jsonb_array_elements_text(COALESCE(author -> 'cpfs', '[]'::jsonb)))
           OR (a.passport IS NOT NULL
               AND a.country || ':' || a.passport IN (SELECT jsonb_array_elements_text(COALESCE(author -> 'passports', '[]'::jsonb))))
         )
       GROUP BY s.id
    )
    SELECT count(*) FILTER (WHERE first_line = 1), count(*) FILTER (WHERE first_line > 1)
      INTO as_main, as_coauthor
      FROM held;
    IF place = 1 AND as_main >= p_max_as_main THEN
      RETURN jsonb_build_object('refused', 'too_many_as_main', 'position', place);
    END IF;
    IF place > 1 AND as_coauthor >= p_max_as_coauthor THEN
      RETURN jsonb_build_object('refused', 'coauthor_limit', 'position', place);
    END IF;
  END LOOP;

  IF p_id IS NULL THEN
    INSERT INTO submissions (
      event_id, user_id, title, title_en, modality, area_ref, abstract, keywords, keywords_en,
      file_path, file_name, file_pages, locale, created_at, updated_at
    ) VALUES (
      p_event_id, p_user_id, p_fields ->> 'title', p_fields ->> 'titleEn',
      (p_fields ->> 'modality')::"SubmissionModality", p_fields ->> 'areaRef', p_fields ->> 'abstract',
      ARRAY(SELECT jsonb_array_elements_text(p_fields -> 'keywords')),
      ARRAY(SELECT jsonb_array_elements_text(p_fields -> 'keywordsEn')),
      p_fields ->> 'filePath', p_fields ->> 'fileName', (p_fields ->> 'filePages')::integer,
      p_fields ->> 'locale', stamp, stamp
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE submissions
       SET title = p_fields ->> 'title',
           title_en = p_fields ->> 'titleEn',
           modality = (p_fields ->> 'modality')::"SubmissionModality",
           area_ref = p_fields ->> 'areaRef',
           abstract = p_fields ->> 'abstract',
           keywords = ARRAY(SELECT jsonb_array_elements_text(p_fields -> 'keywords')),
           keywords_en = ARRAY(SELECT jsonb_array_elements_text(p_fields -> 'keywordsEn')),
           file_path = p_fields ->> 'filePath',
           file_name = p_fields ->> 'fileName',
           file_pages = (p_fields ->> 'filePages')::integer,
           locale = p_fields ->> 'locale',
           updated_at = stamp
     WHERE id = p_id AND event_id = p_event_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('refused', 'submission_not_found');
    END IF;
    DELETE FROM submission_authors WHERE submission_id = p_id;
  END IF;

  INSERT INTO submission_authors (submission_id, position, full_name, email, cpf, passport, country, created_at)
  SELECT saved_id, (a ->> 'position')::integer, a ->> 'fullName', a ->> 'email',
         a ->> 'cpf', a ->> 'passport', a ->> 'country', stamp
    FROM jsonb_array_elements(p_authors) a;

  RETURN jsonb_build_object('id', saved_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_submission(uuid, uuid, uuid, jsonb, jsonb, integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_submission(uuid, uuid, uuid, jsonb, jsonb, integer, integer, timestamptz) TO service_role;

-- The CPF check is for the database's own constraints, not something to call from outside.
REVOKE ALL ON FUNCTION public.is_valid_cpf(text) FROM anon, authenticated;
