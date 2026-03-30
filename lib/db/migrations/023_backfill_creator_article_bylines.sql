-- Backfill byline/location for creator articles approved before pen-name bylines were written.
UPDATE articles a
SET
  byline = CASE
    WHEN trim(cp.pen_name) <> '' THEN 'By ' || trim(cp.pen_name)
    ELSE 'By Creator'
  END,
  location = CASE
    WHEN cp.locale IS NOT NULL
      AND trim(cp.locale) <> ''
      AND lower(trim(cp.locale)) <> 'global'
    THEN trim(cp.locale)
    ELSE ''
  END
FROM creator_profiles cp
WHERE a.source = 'creator'
  AND a.author_user_id = cp.user_id
  AND (a.byline IS NULL OR trim(a.byline) = '');
