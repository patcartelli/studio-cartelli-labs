// tests/life-core.spec.ts
// Node-side logic tests for the Game of Life simulation core — no browser page.
import { test, expect } from '@playwright/test';
import {
  createGrid,
  step,
  randomize,
  clear,
  getCell,
  setCell,
  countLive,
} from '../src/lib/life';

test('block still life is stable', () => {
  const g = createGrid(4, 4);
  setCell(g, 1, 1, 1);
  setCell(g, 2, 1, 1);
  setCell(g, 1, 2, 1);
  setCell(g, 2, 2, 1);
  const next = step(g);
  expect(Array.from(next.cells)).toEqual(Array.from(g.cells));
});

test('blinker oscillates with period 2 and step does not mutate its input', () => {
  const g = createGrid(5, 5);
  // Horizontal blinker on the middle row.
  setCell(g, 1, 2, 1);
  setCell(g, 2, 2, 1);
  setCell(g, 3, 2, 1);
  const snapshot = Array.from(g.cells);

  const gen1 = step(g);
  // Vertical blinker in the middle column.
  expect(countLive(gen1)).toBe(3);
  expect(getCell(gen1, 2, 1)).toBe(1);
  expect(getCell(gen1, 2, 2)).toBe(1);
  expect(getCell(gen1, 2, 3)).toBe(1);

  const gen2 = step(gen1);
  expect(Array.from(gen2.cells)).toEqual(snapshot);

  // Input grid untouched.
  expect(Array.from(g.cells)).toEqual(snapshot);
});

test('glider translates one cell diagonally every 4 generations', () => {
  const g = createGrid(10, 10);
  // Standard glider, offset from all edges:  . X .
  //                                          . . X
  //                                          X X X
  const gliderAt = (c: number, r: number): Array<[number, number]> => [
    [c + 1, r],
    [c + 2, r + 1],
    [c, r + 2],
    [c + 1, r + 2],
    [c + 2, r + 2],
  ];
  for (const [c, r] of gliderAt(2, 2)) setCell(g, c, r, 1);

  let current = g;
  for (let i = 0; i < 4; i++) current = step(current);

  expect(countLive(current)).toBe(5);
  for (const [c, r] of gliderAt(3, 3)) {
    expect(getCell(current, c, r)).toBe(1);
  }
});

test('toroidal edges: blinker on the top row wraps to the bottom row', () => {
  const g = createGrid(5, 5);
  setCell(g, 1, 0, 1);
  setCell(g, 2, 0, 1);
  setCell(g, 3, 0, 1);
  const next = step(g);
  expect(countLive(next)).toBe(3);
  expect(getCell(next, 2, 4)).toBe(1); // wrapped above the top edge
  expect(getCell(next, 2, 0)).toBe(1);
  expect(getCell(next, 2, 1)).toBe(1);
});

test('randomize fills at the requested density with an injected RNG', () => {
  const g = createGrid(10, 10);
  let i = 0;
  const rng = () => (i++ % 2 === 0 ? 0.25 : 0.75); // alternates below/above 0.5
  randomize(g, 0.5, rng);
  expect(countLive(g)).toBe(50);
});

test('clear empties the grid', () => {
  const g = createGrid(6, 6);
  randomize(g, 1, () => 0); // every cell alive
  expect(countLive(g)).toBe(36);
  clear(g);
  expect(countLive(g)).toBe(0);
});
