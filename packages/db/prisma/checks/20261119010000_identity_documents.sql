-- What 20261119010000_identity_documents must do, asserted by scripts/dryrun.mjs inside a
-- transaction that is rolled back (ADR-010). Every address here is a test address.
DO $$
DECLARE v jsonb; r record; ok boolean; uid uuid := gen_random_uuid(); uid2 uuid := gen_random_uuid(); ev uuid; sub uuid := gen_random_uuid(); reg uuid;
BEGIN
  -- 1. is_valid_cpf against the shared vectors
  FOR r IN SELECT * FROM jsonb_to_recordset(current_setting('app.cpf_vectors')::jsonb) AS x(input text, digits text, valid boolean) LOOP
    IF public.is_valid_cpf(r.digits) IS DISTINCT FROM r.valid THEN RAISE EXCEPTION 'is_valid_cpf(%) should be %', r.digits, r.valid; END IF;
  END LOOP;
  IF public.is_valid_cpf(NULL) THEN RAISE EXCEPTION 'null must not be valid'; END IF;
  IF public.is_valid_cpf('529.982.247-25') THEN RAISE EXCEPTION 'punctuation must not be valid: digits only are stored'; END IF;
  RAISE NOTICE 'ok 1: is_valid_cpf agrees with the vectors';

  -- 2. users: invalid CPF, bad passport, BR passport refused; unique passport+country
  INSERT INTO users (id, email, full_name, updated_at) VALUES (uid, 'e2e+dbcheck-a@sieamb.org', 'A', now()), (uid2, 'e2e+dbcheck-b@sieamb.org', 'B', now());
  BEGIN UPDATE users SET cpf = '52998224724' WHERE id = uid; RAISE EXCEPTION 'invalid CPF accepted on users'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE users SET passport = 'ab 123' WHERE id = uid; RAISE EXCEPTION 'raw passport accepted on users'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE users SET passport = 'AB123456', country = 'BR' WHERE id = uid; RAISE EXCEPTION 'BR passport accepted on users'; EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE users SET cpf = '52998224725', passport = 'AB123456', country = 'PT' WHERE id = uid;
  BEGIN UPDATE users SET passport = 'AB123456', country = 'PT' WHERE id = uid2; RAISE EXCEPTION 'same passport+country accepted twice'; EXCEPTION WHEN unique_violation THEN NULL; END;
  UPDATE users SET passport = 'AB123456', country = 'ES' WHERE id = uid2; -- same number, other country: another person
  BEGIN UPDATE users SET cpf = '52998224725' WHERE id = uid2; RAISE EXCEPTION 'same CPF accepted twice'; EXCEPTION WHEN unique_violation THEN NULL; END;
  RAISE NOTICE 'ok 2: users checks and unique passport';

  -- 3. submission_authors: document columns and checks
  SELECT id INTO ev FROM events WHERE slug = '2027';
  INSERT INTO submissions (id, event_id, user_id, title, title_en, modality, area_ref, abstract, file_path, file_name, updated_at)
    VALUES (sub, ev, uid, 'dbcheck', 'dbcheck', 'RESUMO_EXPANDIDO', 'a1', 'x', 'dbcheck/x.pdf', 'x.pdf', now());
  INSERT INTO submission_authors (id, submission_id, position, full_name, email) VALUES (gen_random_uuid(), sub, 1, 'Old line', 'e2e+dbcheck-a@sieamb.org'); -- a line from before
  INSERT INTO submission_authors (id, submission_id, position, full_name, email, cpf) VALUES (gen_random_uuid(), sub, 2, 'With CPF', 'e2e+dbcheck-c@sieamb.org', '11144477735');
  INSERT INTO submission_authors (id, submission_id, position, full_name, email, passport, country) VALUES (gen_random_uuid(), sub, 3, 'With passport', 'e2e+dbcheck-d@sieamb.org', 'ZZ999999', 'US');
  BEGIN INSERT INTO submission_authors (id, submission_id, position, full_name, email, cpf) VALUES (gen_random_uuid(), sub, 4, 'Bad', 'e2e+dbcheck-e@sieamb.org', '11144477736'); RAISE EXCEPTION 'invalid CPF accepted on an author'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO submission_authors (id, submission_id, position, full_name, email, passport) VALUES (gen_random_uuid(), sub, 4, 'Bad', 'e2e+dbcheck-e@sieamb.org', 'ZZ999999'); RAISE EXCEPTION 'passport without country accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO submission_authors (id, submission_id, position, full_name, email, cpf, country) VALUES (gen_random_uuid(), sub, 4, 'Bad', 'e2e+dbcheck-e@sieamb.org', '11144477735', 'PT'); RAISE EXCEPTION 'country without passport accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO submission_authors (id, submission_id, position, full_name, email, passport, country) VALUES (gen_random_uuid(), sub, 4, 'Bad', 'e2e+dbcheck-e@sieamb.org', 'ZZ999999', 'BR'); RAISE EXCEPTION 'BR passport accepted on an author'; EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'ok 3: submission_authors columns and checks';

  -- 4. pre_registrations: the trigger normalises, refuses an invalid CPF on insert, leaves old rows alone
  INSERT INTO pre_registrations (event_id, full_name, email, cpf, passport, country, category, modality, consent_at)
    VALUES (ev, 'Reg', 'e2e+dbcheck-r1@sieamb.org', '529.982.247-25', ' ab 123-456 ', 'pt', 'PROFESSOR', 'ONLINE', now()) RETURNING id INTO reg;
  SELECT cpf, passport, country INTO r FROM pre_registrations WHERE id = reg;
  IF r.cpf <> '52998224725' OR r.passport <> 'AB123456' OR r.country <> 'PT' THEN RAISE EXCEPTION 'not normalised: % % %', r.cpf, r.passport, r.country; END IF;
  BEGIN INSERT INTO pre_registrations (event_id, full_name, email, cpf, category, modality, consent_at) VALUES (ev, 'Reg', 'e2e+dbcheck-r2@sieamb.org', '52998224724', 'PROFESSOR', 'ONLINE', now()); RAISE EXCEPTION 'invalid CPF accepted on a registration';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO pre_registrations (event_id, full_name, email, cpf, passport, category, modality, consent_at) VALUES (ev, 'Reg', 'e2e+dbcheck-r3@sieamb.org', '', '', 'PROFESSOR', 'ONLINE', now()) RETURNING id INTO reg;
  SELECT cpf, passport, country INTO r FROM pre_registrations WHERE id = reg;
  IF r.cpf IS NOT NULL OR r.passport IS NOT NULL OR r.country <> 'BR' THEN RAISE EXCEPTION 'empty strings not turned to null: % % %', r.cpf, r.passport, r.country; END IF;
  -- an old row with a bad CPF (written with the trigger off) can still be updated in other columns
  ALTER TABLE pre_registrations DISABLE TRIGGER pre_registrations_normalise_document;
  INSERT INTO pre_registrations (event_id, full_name, email, cpf, category, modality, consent_at) VALUES (ev, 'Old', 'e2e+dbcheck-r4@sieamb.org', '52998224724', 'PROFESSOR', 'ONLINE', now()) RETURNING id INTO reg;
  ALTER TABLE pre_registrations ENABLE TRIGGER pre_registrations_normalise_document;
  UPDATE pre_registrations SET full_name = 'Old, renamed', user_id = uid2 WHERE id = reg;
  UPDATE pre_registrations SET country = 'BR' WHERE id = reg; -- touching a document column without changing the CPF is fine too
  BEGIN UPDATE pre_registrations SET cpf = '52998224723' WHERE id = reg; RAISE EXCEPTION 'CPF changed to an invalid one'; EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE pre_registrations SET cpf = '111.444.777-35' WHERE id = reg;
  IF (SELECT cpf FROM pre_registrations WHERE id = reg) <> '11144477735' THEN RAISE EXCEPTION 'CPF not normalised on update'; END IF;
  RAISE NOTICE 'ok 4: pre_registrations trigger';

  -- 5. signup_documents
  INSERT INTO signup_documents (email, cpf) VALUES ('e2e+dbcheck-s@sieamb.org', '52998224725');
  BEGIN INSERT INTO signup_documents (email, cpf) VALUES ('e2e+dbcheck-s@sieamb.org', '11144477735'); RAISE EXCEPTION 'two waiting documents for one address'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO signup_documents (email, cpf) VALUES ('E2E+dbcheck-t@sieamb.org', '11144477735'); RAISE EXCEPTION 'upper-case address accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO signup_documents (email) VALUES ('e2e+dbcheck-u@sieamb.org'); RAISE EXCEPTION 'waiting line without a document'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO signup_documents (email, cpf) VALUES ('e2e+dbcheck-u@sieamb.org', '12345678900'); RAISE EXCEPTION 'invalid CPF waiting'; EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO signup_documents (email, passport, country) VALUES ('e2e+dbcheck-u@sieamb.org', 'AB123456', 'PT');
  IF (SELECT created_at FROM signup_documents WHERE email = 'e2e+dbcheck-u@sieamb.org') IS NULL THEN RAISE EXCEPTION 'no created_at'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.signup_documents'::regclass) THEN RAISE EXCEPTION 'RLS off on signup_documents'; END IF;
  IF has_table_privilege('anon', 'public.signup_documents', 'SELECT') OR has_table_privilege('authenticated', 'public.signup_documents', 'INSERT') THEN RAISE EXCEPTION 'the browser can reach signup_documents'; END IF;
  RAISE NOTICE 'ok 5: signup_documents';
END $$;
