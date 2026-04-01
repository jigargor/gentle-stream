-- Add rabbit_hole as an allowed game type in user/game tables.

ALTER TABLE user_profiles
  ALTER COLUMN enabled_game_types
  SET DEFAULT ARRAY[
    'sudoku',
    'word_search',
    'crossword',
    'killer_sudoku',
    'nonogram',
    'connections',
    'rabbit_hole'
  ];

UPDATE user_profiles
SET enabled_game_types = array_append(enabled_game_types, 'rabbit_hole')
WHERE enabled_game_types IS NOT NULL
  AND NOT ('rabbit_hole' = ANY(enabled_game_types));

ALTER TABLE game_completions DROP CONSTRAINT IF EXISTS game_completions_game_type_check;
ALTER TABLE game_completions
  ADD CONSTRAINT game_completions_game_type_check
  CHECK (game_type IN (
    'sudoku',
    'word_search',
    'killer_sudoku',
    'nonogram',
    'crossword',
    'connections',
    'rabbit_hole'
  ));

ALTER TABLE game_saves DROP CONSTRAINT IF EXISTS game_saves_game_type_check;
ALTER TABLE game_saves
  ADD CONSTRAINT game_saves_game_type_check
  CHECK (game_type IN (
    'sudoku',
    'word_search',
    'killer_sudoku',
    'nonogram',
    'crossword',
    'connections',
    'rabbit_hole'
  ));
