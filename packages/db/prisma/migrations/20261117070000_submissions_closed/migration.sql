-- Closing and reopening submissions by hand (#236): the organisers' own switch,
-- apart from the published date, which locks nothing (#233).
ALTER TABLE "events" ADD COLUMN "submissions_closed_at" TIMESTAMP(3),
ADD COLUMN "submissions_closed_by" UUID;
