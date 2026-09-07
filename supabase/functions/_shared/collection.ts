// CollectionEnvelope — Edge mirror of web/lib/contracts/collection.ts
// (governance/OPERATING_TRUTH_MODEL.md §4.3). sem-ai-command/index.ts builds the same shape
// inline as context.collections (shown / total / truncated / scope) for every pack collection.

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

export function fromCountedResult<T>(result: { data: T[] | null; count: number | null }, extra: { order?: string; scope?: string } = {}): CollectionEnvelope<T> {
  return collectionEnvelope(result.data ?? [], typeof result.count === 'number' ? result.count : null, extra);
}

export function describeCollection(env: CollectionEnvelope<unknown>, noun: string): string {
  if (env.total === null) return `${env.shown} ${noun} shown (total unknown${env.scope ? `; ${env.scope}` : ''})`;
  if (env.truncated) return `${env.shown} of ${env.total} ${noun} shown`;
  return `${env.total} ${noun}`;
}
