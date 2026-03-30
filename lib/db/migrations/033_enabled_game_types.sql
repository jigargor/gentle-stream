-- Enabled game types per user (feed + daily connections).
-- Used to filter which games appear in the stream.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS enabled_game_types TEXT[] NOT NULL DEFAULT ARRAY[
    'sudoku',
    'word_search',
    'crossword',
    'killer_sudoku',
    'nonogram',
    'connections'
  ];
