-- What 20261119020000_save_submission must do, asserted by scripts/dryrun.mjs inside a
-- transaction that is rolled back (ADR-010). Every address here is a test address.
DO $$
DECLARE
  ev uuid; other_ev uuid; u uuid := gen_random_uuid(); r jsonb; first_id uuid; n integer; i integer;
  fields jsonb := '{"title":"dbcheck paper","titleEn":"dbcheck paper","modality":"RESUMO_EXPANDIDO","areaRef":"a1","abstract":"x","keywords":["um","dois"],"keywordsEn":["one"],"filePath":"dbcheck/x.pdf","fileName":"x.pdf","filePages":5,"locale":"pt-BR"}';
  -- A sender with a CPF, and a co-author known by e-mail, CPF and passport.
  sender jsonb := '{"position":1,"fullName":"Sender","email":"e2e+dbcheck-s@sieamb.org","cpf":"52998224725","passport":null,"country":null,"emails":["e2e+dbcheck-s@sieamb.org"],"cpfs":["52998224725"],"passports":[]}';
  co jsonb := '{"position":2,"fullName":"Co","email":"e2e+dbcheck-c@sieamb.org","cpf":"11144477735","passport":"AB123456","country":"PT","emails":["e2e+dbcheck-c@sieamb.org"],"cpfs":["11144477735"],"passports":["PT:AB123456"]}';
  other jsonb;
BEGIN
  SELECT id INTO ev FROM events WHERE slug = '2027';
  SELECT id INTO other_ev FROM events WHERE slug = '2025';
  INSERT INTO users (id, email, full_name, updated_at) VALUES (u, 'e2e+dbcheck-s@sieamb.org', 'Sender', now());

  -- 1. A new paper is written with its authors and their documents.
  r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(sender, co), 3, 5, now());
  first_id := (r ->> 'id')::uuid;
  IF first_id IS NULL THEN RAISE EXCEPTION 'new paper not written: %', r; END IF;
  SELECT count(*) INTO n FROM submission_authors WHERE submission_id = first_id;
  IF n <> 2 THEN RAISE EXCEPTION 'expected 2 authors, got %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM submission_authors WHERE submission_id = first_id AND position = 2 AND cpf = '11144477735' AND passport = 'AB123456' AND country = 'PT' AND full_name = 'Co')
    THEN RAISE EXCEPTION 'co-author document not stored'; END IF;
  IF NOT EXISTS (SELECT 1 FROM submissions WHERE id = first_id AND user_id = u AND keywords = ARRAY['um','dois'] AND keywords_en = ARRAY['one'] AND file_pages = 5 AND status = 'SUBMITTED' AND modality = 'RESUMO_EXPANDIDO')
    THEN RAISE EXCEPTION 'paper fields not stored as sent'; END IF;
  RAISE NOTICE 'ok 1: a new paper is written with its authors';

  -- 2. Changing it replaces the authors in the same step, and keeps its number and sender.
  r := public.save_submission(first_id, ev, u, fields || '{"title":"dbcheck changed"}', jsonb_build_array(sender), 3, 5, now());
  IF (r ->> 'id')::uuid <> first_id THEN RAISE EXCEPTION 'change not written: %', r; END IF;
  SELECT count(*) INTO n FROM submission_authors WHERE submission_id = first_id;
  IF n <> 1 OR (SELECT title FROM submissions WHERE id = first_id) <> 'dbcheck changed' THEN RAISE EXCEPTION 'change did not replace the authors or the title'; END IF;
  RAISE NOTICE 'ok 2: a change replaces the authors';

  -- 3. A paper of another edition, a withdrawn one or one that does not exist is not changed.
  r := public.save_submission(first_id, other_ev, u, fields, jsonb_build_array(sender), 3, 5, now());
  IF r ->> 'refused' <> 'submission_not_found' THEN RAISE EXCEPTION 'changed through another edition: %', r; END IF;
  r := public.save_submission(gen_random_uuid(), ev, u, fields, jsonb_build_array(sender), 3, 5, now());
  IF r ->> 'refused' <> 'submission_not_found' THEN RAISE EXCEPTION 'changed a paper that does not exist: %', r; END IF;
  IF (SELECT count(*) FROM submission_authors WHERE submission_id = first_id) <> 1 THEN RAISE EXCEPTION 'a refused change touched the authors'; END IF;
  RAISE NOTICE 'ok 3: only a standing paper of the edition is changed';

  -- 4. The limit as first author: three stand, the fourth is refused and nothing is written.
  FOR i IN 2..3 LOOP
    r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(sender), 3, 5, now());
    IF r ->> 'id' IS NULL THEN RAISE EXCEPTION 'paper % refused: %', i, r; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM submissions WHERE user_id = u;
  r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(sender), 3, 5, now());
  IF r ->> 'refused' <> 'too_many_as_main' OR (r ->> 'position')::integer <> 1 THEN RAISE EXCEPTION 'fourth as first author: %', r; END IF;
  IF (SELECT count(*) FROM submissions WHERE user_id = u) <> n THEN RAISE EXCEPTION 'a refused paper was written'; END IF;
  -- Changing one of the three is not a fourth.
  r := public.save_submission(first_id, ev, u, fields, jsonb_build_array(sender), 3, 5, now());
  IF r ->> 'id' IS NULL THEN RAISE EXCEPTION 'changing one of the three was refused: %', r; END IF;
  -- A withdrawn paper frees its place.
  UPDATE submissions SET deleted_at = now() WHERE id = first_id;
  r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(sender), 3, 5, now());
  IF r ->> 'id' IS NULL THEN RAISE EXCEPTION 'place of a withdrawn paper not freed: %', r; END IF;
  RAISE NOTICE 'ok 4: the limit as first author';

  -- 5. The same person under another e-mail is the same person: counted by CPF.
  other := sender || '{"email":"e2e+dbcheck-alias@sieamb.org","emails":["e2e+dbcheck-alias@sieamb.org"]}';
  r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(other), 3, 5, now());
  IF r ->> 'refused' <> 'too_many_as_main' THEN RAISE EXCEPTION 'another e-mail got around the limit: %', r; END IF;
  -- And by passport, when the line holds only that.
  DELETE FROM submissions WHERE user_id = u;
  other := '{"position":1,"fullName":"P","email":"e2e+dbcheck-p1@sieamb.org","cpf":null,"passport":"ZZ999999","country":"US","emails":["e2e+dbcheck-p1@sieamb.org"],"cpfs":[],"passports":["US:ZZ999999"]}';
  FOR i IN 1..3 LOOP
    r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(other), 3, 5, now());
  END LOOP;
  other := other || '{"email":"e2e+dbcheck-p2@sieamb.org","emails":["e2e+dbcheck-p2@sieamb.org"]}';
  r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(other), 3, 5, now());
  IF r ->> 'refused' <> 'too_many_as_main' THEN RAISE EXCEPTION 'another e-mail got around the limit by passport: %', r; END IF;
  -- The same number from another country is another person.
  other := other || '{"country":"CA","passports":["CA:ZZ999999"]}';
  r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(other), 3, 5, now());
  IF r ->> 'id' IS NULL THEN RAISE EXCEPTION 'same passport number of another country refused: %', r; END IF;
  RAISE NOTICE 'ok 5: counted per person, by CPF and by passport with its country';

  -- 6. The limit in other places, and each place counted on its own.
  DELETE FROM submissions WHERE user_id = u;
  FOR i IN 1..5 LOOP
    other := jsonb_build_object('position', 1, 'fullName', 'Lead', 'email', 'e2e+dbcheck-l' || i || '@sieamb.org', 'cpf', NULL, 'passport', 'LEAD' || i || '000', 'country', 'US',
                                'emails', jsonb_build_array('e2e+dbcheck-l' || i || '@sieamb.org'), 'cpfs', '[]'::jsonb, 'passports', jsonb_build_array('US:LEAD' || i || '000'));
    r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(other, co), 3, 5, now());
    IF r ->> 'id' IS NULL THEN RAISE EXCEPTION 'co-authorship % refused: %', i, r; END IF;
  END LOOP;
  other := other || '{"email":"e2e+dbcheck-l6@sieamb.org","passport":"LEAD6000","emails":["e2e+dbcheck-l6@sieamb.org"],"passports":["US:LEAD6000"]}';
  r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(other, co), 3, 5, now());
  IF r ->> 'refused' <> 'coauthor_limit' OR (r ->> 'position')::integer <> 2 THEN RAISE EXCEPTION 'sixth co-authorship: %', r; END IF;
  -- Five in other places take nothing from the places as first author.
  r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(co || '{"position":1}'), 3, 5, now());
  IF r ->> 'id' IS NULL THEN RAISE EXCEPTION 'first author refused because of co-authorships: %', r; END IF;
  -- A line written before documents existed still counts, by its e-mail.
  INSERT INTO submissions (id, event_id, user_id, title, title_en, modality, area_ref, abstract, file_path, file_name) VALUES (first_id, ev, u, 'old', 'old', 'ARTIGO', 'a1', 'x', 'dbcheck/o.pdf', 'o.pdf');
  INSERT INTO submission_authors (submission_id, position, full_name, email) VALUES (first_id, 1, 'Co, long ago', 'e2e+dbcheck-c@sieamb.org');
  r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(co || '{"position":1}'), 2, 5, now());
  IF r ->> 'refused' <> 'too_many_as_main' THEN RAISE EXCEPTION 'an old line without a document was not counted: %', r; END IF;
  RAISE NOTICE 'ok 6: the limit in other places, and old lines counted by e-mail';

  -- 7. Only the server may call it.
  IF has_function_privilege('anon', 'public.save_submission(uuid, uuid, uuid, jsonb, jsonb, integer, integer, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.save_submission(uuid, uuid, uuid, jsonb, jsonb, integer, integer, timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.save_submission(uuid, uuid, uuid, jsonb, jsonb, integer, integer, timestamptz)', 'EXECUTE')
    THEN RAISE EXCEPTION 'wrong grants on save_submission'; END IF;
  -- A document the table refuses is refused here too, and nothing of the paper is left.
  SELECT count(*) INTO n FROM submissions WHERE user_id = u;
  BEGIN
    r := public.save_submission(NULL, ev, u, fields, jsonb_build_array(sender || '{"cpf":"52998224724"}'), 9, 9, now());
    RAISE EXCEPTION 'an invalid CPF was written through save_submission';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM submissions WHERE user_id = u) <> n THEN RAISE EXCEPTION 'a paper was left behind by a refused author'; END IF;
  RAISE NOTICE 'ok 7: grants, and a refused author leaves no paper';
END $$;
