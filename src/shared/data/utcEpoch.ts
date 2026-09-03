/** OMM timestamps without an offset are UTC, never the computer's local time. */
export function parseUtcEpoch(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return Number.NaN;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2])
    || date.getUTCDate() !== Number(match[3])) return Number.NaN;
  return Date.parse(match[4] ? value : `${value}Z`);
}
