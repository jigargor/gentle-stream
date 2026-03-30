-- Add "changes_requested" moderation state so admins can send drafts back for revision.

ALTER TABLE article_submissions
  DROP CONSTRAINT IF EXISTS article_submissions_status_check;

ALTER TABLE article_submissions
  ADD CONSTRAINT article_submissions_status_check
  CHECK (status IN ('pending', 'changes_requested', 'approved', 'rejected', 'withdrawn'));
