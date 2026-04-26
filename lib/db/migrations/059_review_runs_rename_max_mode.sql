-- Rename legacy "max" review mode to challenger_validation (honest label; not adaptive model switching).

ALTER TABLE review_runs DROP CONSTRAINT IF EXISTS review_runs_mode_check;

UPDATE review_runs SET mode = 'challenger_validation' WHERE mode = 'max';

ALTER TABLE review_runs
  ADD CONSTRAINT review_runs_mode_check
  CHECK (mode IN ('standard', 'challenger_validation'));
