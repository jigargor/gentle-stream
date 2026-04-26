import { describe, expect, it } from "vitest";
import {
  initConnectionsState,
  reduceConnectionsState,
  type ConnectionsEnginePuzzle,
} from "../connections/reducer";

const puzzle: ConnectionsEnginePuzzle = {
  groups: [
    { tier: 1, words: ["A", "B", "C", "D"] },
    { tier: 2, words: ["E", "F", "G", "H"] },
    { tier: 3, words: ["I", "J", "K", "L"] },
    { tier: 4, words: ["M", "N", "O", "P"] },
  ],
};

describe("connections reducer", () => {
  it("toggles selection and limits to four words", () => {
    let state = initConnectionsState(puzzle);
    state = reduceConnectionsState(state, { type: "TOGGLE", word: "A" }, puzzle);
    state = reduceConnectionsState(state, { type: "TOGGLE", word: "B" }, puzzle);
    state = reduceConnectionsState(state, { type: "TOGGLE", word: "C" }, puzzle);
    state = reduceConnectionsState(state, { type: "TOGGLE", word: "D" }, puzzle);
    state = reduceConnectionsState(state, { type: "TOGGLE", word: "E" }, puzzle);
    expect(state.selected.size).toBe(4);
    expect(state.selected.has("E")).toBe(false);
  });

  it("solves a correct group and clears selection", () => {
    let state = initConnectionsState(puzzle);
    state = { ...state, words: puzzle.groups.flatMap((group) => group.words) };
    for (const word of puzzle.groups[0].words) {
      state = reduceConnectionsState(state, { type: "TOGGLE", word }, puzzle);
    }
    state = reduceConnectionsState(state, { type: "SUBMIT" }, puzzle);
    expect(state.solved).toContain(1);
    expect(state.selected.size).toBe(0);
    expect(state.words.length).toBe(12);
  });

  it("decrements mistakes on incorrect group", () => {
    let state = initConnectionsState(puzzle);
    state = reduceConnectionsState(state, { type: "TOGGLE", word: "A" }, puzzle);
    state = reduceConnectionsState(state, { type: "TOGGLE", word: "E" }, puzzle);
    state = reduceConnectionsState(state, { type: "TOGGLE", word: "I" }, puzzle);
    state = reduceConnectionsState(state, { type: "TOGGLE", word: "M" }, puzzle);
    state = reduceConnectionsState(state, { type: "SUBMIT" }, puzzle);
    expect(state.mistakesLeft).toBe(3);
    expect(state.completed).toBe(false);
  });
});
