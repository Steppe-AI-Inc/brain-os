// CollectionEnvelope — governance/OPERATING_TRUTH_MODEL.md §4.3.
// Mirrored for the Edge runtime in supabase/functions/_shared/collection.ts.
//
// `items.length` never means total. `total` comes from an authoritative count; when the
// source has no authoritative count (top-K semantic retrieval) total is null and the
// collection is labelled by `scope`, never presented as complete.

export type CollectionEnvelope<T> = {
  items: T[];
  shown: number;
  total: number | null;
  truncated: boolean | null;
  order?: string;
  scope?: string;
};

export function collectionEnvelope<T>(items: T[], total: number | null, extra: { order?: string; scope?: string } = {}): CollectionEnvelope<T> {
  const shown = items.length;
  return { items, shown, total, truncated: total === null ? null : total > shown, ...extra };
}

/** Wraps a PostgREST result that was queried with `{ count: 'exact' }`. */
export function fromCountedResult<T>(result: { data: T[] | null; count: number | null }, extra: { order?: string; scope?: string } = {}): CollectionEnvelope<T> {
  return collectionEnvelope(result.data ?? [], typeof result.count === 'number' ? result.count : null, extra);
}

/** "N of M shown" when truncated; "N" when complete; "N shown (total unknown)" otherwise. */
export function describeCollection(env: CollectionEnvelope<unknown>, noun: string): string {
  if (env.total === null) return `${env.shown} ${noun} shown (total unknown${env.scope ? `; ${env.scope}` : ''})`;
  if (env.truncated) return `${env.shown} of ${env.total} ${noun} shown`;
  return `${env.total} ${noun}`;
}
