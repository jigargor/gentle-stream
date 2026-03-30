-- One-time backfill: assign stable identity fields to legacy Connections payloads.
-- This enables robust de-duplication/exclusion for already-completed puzzles.

WITH canonical AS (
  SELECT
    g.id,
    (
      SELECT string_agg(
        format(
          '%s:%s:%s',
          COALESCE((grp->>'tier')::int, 0),
          upper(trim(COALESCE(grp->>'label', ''))),
          (
            SELECT string_agg(upper(trim(w.value::text, '"')), ',' ORDER BY upper(trim(w.value::text, '"')))
            FROM jsonb_array_elements(COALESCE(grp->'words', '[]'::jsonb)) AS w(value)
          )
        ),
        '|' ORDER BY COALESCE((grp->>'tier')::int, 0), upper(trim(COALESCE(grp->>'label', '')))
      )
      FROM jsonb_array_elements(COALESCE(g.payload->'groups', '[]'::jsonb)) AS grp
    ) AS canonical_text
  FROM games g
  WHERE g.type = 'connections'
),
updates AS (
  SELECT
    c.id,
    ('conn_' || substr(md5(COALESCE(c.canonical_text, '')), 1, 20)) AS puzzle_id
  FROM canonical c
  WHERE c.canonical_text IS NOT NULL
    AND c.canonical_text <> ''
)
UPDATE games g
SET payload = jsonb_set(
  jsonb_set(
    g.payload,
    '{puzzleId}',
    to_jsonb(u.puzzle_id),
    true
  ),
  '{uniquenessSignature}',
  to_jsonb(u.puzzle_id),
  true
)
FROM updates u
WHERE g.id = u.id
  AND g.type = 'connections'
  AND (
    COALESCE(g.payload->>'puzzleId', '') = ''
    OR COALESCE(g.payload->>'uniquenessSignature', '') = ''
  );
