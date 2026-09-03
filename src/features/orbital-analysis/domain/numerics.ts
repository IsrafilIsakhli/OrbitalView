/** Refine a bracketed crossing without treating missing samples as measurements. */
export function refineCrossing(sample: (time: number) => number | null, threshold: number, start: number, end: number, rising: boolean): number {
  if (![start, end, threshold].every(Number.isFinite) || end < start) throw new Error("Invalid crossing interval");
  const first = sample(start), last = sample(end);
  if (first === null || last === null || !Number.isFinite(first) || !Number.isFinite(last)) throw new Error("Invalid crossing sample");
  if (!(rising ? first <= threshold && last >= threshold : first >= threshold && last <= threshold)) throw new Error("Crossing is not bracketed");
  let left = start;
  let right = end;
  while (right - left > 1_000) {
    const middle = (left + right) / 2;
    const value = sample(middle);
    if (value === null || !Number.isFinite(value)) throw new Error("Invalid crossing sample");
    if (rising ? value >= threshold : value < threshold) right = middle;
    else left = middle;
  }
  return Math.round((left + right) / 2);
}

/** Bracket the best coarse sample, refine locally, and include interval endpoints. */
export function minimizeBounded(sample: (time: number) => number | null, start: number, end: number, divisions = 24): number {
  if (![start, end].every(Number.isFinite) || end < start || !Number.isInteger(divisions) || divisions < 1 || divisions > 256) throw new Error("Invalid extremum interval");
  const evaluate = (time: number) => {
    const value = sample(time);
    return value !== null && Number.isFinite(value) ? value : Infinity;
  };
  const step = (end - start) / divisions;
  let bestTime = start;
  let best = evaluate(start);
  for (let index = 1; index <= divisions; index += 1) {
    const time = start + step * index;
    const value = evaluate(time);
    if (value < best) { best = value; bestTime = time; }
  }
  if (!Number.isFinite(best)) throw new Error("No valid extremum samples");
  let left = Math.max(start, bestTime - step);
  let right = Math.min(end, bestTime + step);
  for (let i = 0; i < 40 && right - left > 500; i += 1) {
    const a = left + (right - left) / 3;
    const b = right - (right - left) / 3;
    if (evaluate(a) > evaluate(b)) left = a; else right = b;
  }
  const refined = Math.round((left + right) / 2);
  return evaluate(refined) < best ? refined : bestTime;
}
