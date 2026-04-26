export interface ConnectionsEngineGroup {
  tier: 1 | 2 | 3 | 4;
  words: string[];
}

export interface ConnectionsEnginePuzzle {
  groups: ConnectionsEngineGroup[];
}

export interface ConnectionsEngineState {
  words: string[];
  selected: Set<string>;
  solved: Array<ConnectionsEngineGroup["tier"]>;
  guesses: string[][];
  mistakesLeft: number;
  completed: boolean;
  startedAt: number | null;
  elapsedSecs: number;
}

export type ConnectionsEngineAction =
  | { type: "TOGGLE"; word: string }
  | { type: "SUBMIT" }
  | { type: "DESELECT_ALL" }
  | { type: "SHUFFLE" }
  | { type: "TICK"; nowMs?: number }
  | { type: "RESET" };

function shuffleWords(words: string[]): string[] {
  const nextWords = [...words];
  for (let index = nextWords.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextWords[index], nextWords[swapIndex]] = [nextWords[swapIndex], nextWords[index]];
  }
  return nextWords;
}

export function initConnectionsState(puzzle: ConnectionsEnginePuzzle): ConnectionsEngineState {
  return {
    words: shuffleWords(puzzle.groups.flatMap((group) => group.words)),
    selected: new Set(),
    solved: [],
    guesses: [],
    mistakesLeft: 4,
    completed: false,
    startedAt: null,
    elapsedSecs: 0,
  };
}

export function reduceConnectionsState(
  state: ConnectionsEngineState,
  action: ConnectionsEngineAction,
  puzzle: ConnectionsEnginePuzzle
): ConnectionsEngineState {
  switch (action.type) {
    case "TOGGLE": {
      if (state.completed) return state;
      const selectedWords = new Set(state.selected);
      if (selectedWords.has(action.word)) {
        selectedWords.delete(action.word);
      } else if (selectedWords.size < 4) {
        selectedWords.add(action.word);
      }
      return {
        ...state,
        selected: selectedWords,
        startedAt: state.startedAt ?? Date.now(),
      };
    }
    case "SUBMIT": {
      if (state.selected.size !== 4 || state.completed) return state;
      const guessedWords = [...state.selected];
      const guesses = [...state.guesses, guessedWords];
      const matchedGroup = puzzle.groups.find(
        (group) =>
          !state.solved.includes(group.tier) &&
          group.words.every((word) => state.selected.has(word)) &&
          state.selected.size === group.words.length
      );
      if (matchedGroup) {
        const solvedGroups = [...state.solved, matchedGroup.tier];
        const remainingWords = state.words.filter((word) => !state.selected.has(word));
        return {
          ...state,
          words: remainingWords,
          selected: new Set(),
          solved: solvedGroups,
          guesses,
          completed: solvedGroups.length === 4,
        };
      }
      const mistakesLeft = state.mistakesLeft - 1;
      return {
        ...state,
        selected: new Set(),
        guesses,
        mistakesLeft,
        completed: mistakesLeft === 0,
      };
    }
    case "DESELECT_ALL":
      return { ...state, selected: new Set() };
    case "SHUFFLE":
      return { ...state, words: shuffleWords(state.words) };
    case "TICK": {
      if (state.completed || !state.startedAt) return state;
      const nowMs = action.nowMs ?? Date.now();
      return { ...state, elapsedSecs: Math.floor((nowMs - state.startedAt) / 1000) };
    }
    case "RESET":
      return initConnectionsState(puzzle);
    default:
      return state;
  }
}
