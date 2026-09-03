export function parseSemanticVersion(value: string): { core: number[]; pre: string[] };
export function isSemanticVersion(value: string): boolean;
export function compareSemanticVersions(left: string, right: string): number;
