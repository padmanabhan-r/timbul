// Uncontracted (grade 1) braille for labels. English and Bahasa Indonesia share these letter cells.
// Each cell is the list of raised dots, numbered 1-6 (1-3 down the left column, 4-6 down the right).

const LETTERS: Record<string, number[]> = {
  a: [1], b: [1, 2], c: [1, 4], d: [1, 4, 5], e: [1, 5], f: [1, 2, 4], g: [1, 2, 4, 5], h: [1, 2, 5], i: [2, 4], j: [2, 4, 5],
  k: [1, 3], l: [1, 2, 3], m: [1, 3, 4], n: [1, 3, 4, 5], o: [1, 3, 5], p: [1, 2, 3, 4], q: [1, 2, 3, 4, 5], r: [1, 2, 3, 5],
  s: [2, 3, 4], t: [2, 3, 4, 5], u: [1, 3, 6], v: [1, 2, 3, 6], w: [2, 4, 5, 6], x: [1, 3, 4, 6], y: [1, 3, 4, 5, 6], z: [1, 3, 5, 6],
};
const DIGITS = "jabcdefghi"; // 0 is written like j, 1 like a, and so on, after the number sign
const NUMBER_SIGN = [3, 4, 5, 6];
const PUNCTUATION: Record<string, number[]> = { "-": [3, 6], "'": [3], ",": [2], ".": [2, 5, 6] };

export type Cell = number[]; // empty array is a space

export interface BrailleResult {
  cells: Cell[];
  unsupported: string[];
}

export function toBraille(text: string): BrailleResult {
  const cells: Cell[] = [];
  const unsupported: string[] = [];
  let inNumber = false;
  for (const raw of text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")) {
    if (raw >= "0" && raw <= "9") {
      if (!inNumber) cells.push(NUMBER_SIGN);
      inNumber = true;
      cells.push(LETTERS[DIGITS[Number(raw)]]);
      continue;
    }
    inNumber = false;
    if (raw === " ") cells.push([]);
    else if (LETTERS[raw]) cells.push(LETTERS[raw]);
    else if (PUNCTUATION[raw]) cells.push(PUNCTUATION[raw]);
    else unsupported.push(raw);
  }
  return { cells, unsupported };
}

/** Unicode braille, for screen readers and copy. */
export function toUnicode(cells: Cell[]): string {
  return cells.map((c) => String.fromCharCode(0x2800 + c.reduce((n, d) => n | (1 << (d - 1)), 0))).join("");
}

// Standard braille cell geometry in millimetres (Marburg medium, the common size for school materials).
export const CELL = { dotGap: 2.5, cellGap: 6.2, lineGap: 10, dotR: 0.72 };

/** Dot centres for a run of cells, starting at (x, y) = top-left dot of the first cell. */
export function cellDots(cells: Cell[], x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  cells.forEach((cell, i) => {
    for (const d of cell) {
      const col = d >= 4 ? 1 : 0;
      const row = (d - 1) % 3;
      out.push([x + i * CELL.cellGap + col * CELL.dotGap, y + row * CELL.dotGap]);
    }
  });
  return out;
}

export function cellsWidth(n: number) {
  return n <= 0 ? 0 : (n - 1) * CELL.cellGap + CELL.dotGap;
}
