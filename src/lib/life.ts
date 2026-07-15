// src/lib/life.ts
// Pure Conway's Game of Life simulation core — B3/S23, toroidal edges.
// No DOM coupling; consumed by src/pages/lab/life.astro and tests.

export interface LifeGrid {
  cols: number;
  rows: number;
  /** Row-major cell states: cells[row * cols + col] is 1 (alive) or 0 (dead). */
  cells: Uint8Array;
}

export function createGrid(cols: number, rows: number): LifeGrid {
  return { cols, rows, cells: new Uint8Array(cols * rows) };
}

export function getCell(grid: LifeGrid, col: number, row: number): number {
  return grid.cells[row * grid.cols + col];
}

export function setCell(grid: LifeGrid, col: number, row: number, value: 0 | 1): void {
  grid.cells[row * grid.cols + col] = value;
}

/** Next generation under B3/S23 with toroidal (wrap-around) edges. Returns a new grid. */
export function step(grid: LifeGrid): LifeGrid {
  const { cols, rows, cells } = grid;
  const next = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    const up = ((row - 1 + rows) % rows) * cols;
    const mid = row * cols;
    const down = ((row + 1) % rows) * cols;
    for (let col = 0; col < cols; col++) {
      const left = (col - 1 + cols) % cols;
      const right = (col + 1) % cols;
      const neighbors =
        cells[up + left] + cells[up + col] + cells[up + right] +
        cells[mid + left] + cells[mid + right] +
        cells[down + left] + cells[down + col] + cells[down + right];
      next[mid + col] =
        neighbors === 3 || (cells[mid + col] === 1 && neighbors === 2) ? 1 : 0;
    }
  }
  return { cols, rows, cells: next };
}

/** Reseed every cell: alive with probability `density`. RNG injectable for tests. */
export function randomize(
  grid: LifeGrid,
  density = 0.28,
  random: () => number = Math.random,
): void {
  for (let i = 0; i < grid.cells.length; i++) {
    grid.cells[i] = random() < density ? 1 : 0;
  }
}

export function clear(grid: LifeGrid): void {
  grid.cells.fill(0);
}

export function countLive(grid: LifeGrid): number {
  let n = 0;
  for (let i = 0; i < grid.cells.length; i++) n += grid.cells[i];
  return n;
}
