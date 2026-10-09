export type StructuredNumberDrafts = Readonly<Record<string, string>>;

const FORMAT = 'structured-number-drafts-v1';

/** An unfinished number is editor input, separate from the last valid saved value. */
export function parseStructuredNumberDrafts(raw: string | undefined): StructuredNumberDrafts {
  if (raw === undefined) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    if (record.format !== FORMAT || !record.drafts || typeof record.drafts !== 'object' || Array.isArray(record.drafts)) return {};
    return Object.fromEntries(Object.entries(record.drafts).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch { return {}; }
}

export function serializeStructuredNumberDrafts(drafts: StructuredNumberDrafts): string | undefined {
  return Object.keys(drafts).length ? JSON.stringify({ format: FORMAT, drafts }) : undefined;
}

export function clearStructuredNumberDrafts(drafts: StructuredNumberDrafts, path: string): StructuredNumberDrafts {
  return Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== path && !key.startsWith(`${path}.`)));
}

export function renameStructuredDraftPath(drafts: StructuredNumberDrafts, path: string, nextPath: string): StructuredNumberDrafts {
  return Object.fromEntries(Object.entries(drafts).map(([key, raw]) => [key === path || key.startsWith(`${path}.`) ? `${nextPath}${key.slice(path.length)}` : key, raw]));
}

/** Array editing must move unfinished input with its item, including nested fields. */
export function reindexStructuredNumberDrafts(drafts: StructuredNumberDrafts, path: string, mapIndex: (index: number) => number | undefined): StructuredNumberDrafts {
  return Object.fromEntries(Object.entries(drafts).flatMap(([key, raw]) => {
    if (!key.startsWith(`${path}.`)) return [[key, raw]];
    const tail = key.slice(path.length + 1), match = /^(\d+)(\..*)?$/.exec(tail);
    if (!match) return [[key, raw]];
    const index = mapIndex(Number(match[1]));
    return index === undefined ? [] : [[`${path}.${index}${match[2] ?? ''}`, raw]];
  }));
}
