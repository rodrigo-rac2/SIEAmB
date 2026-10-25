-- The browser inserts into pre_registrations through PostgREST, where Prisma's
-- client-side uuid() default never runs (#149). Generate the id in the database.
ALTER TABLE "pre_registrations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
