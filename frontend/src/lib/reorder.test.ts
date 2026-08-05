import { isOptimisticId, reorderPayload } from './reorder';

const a = { id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa' };
const b = { id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb' };
const c = { id: 'cccccccc-3333-4333-8333-cccccccccccc' };
const current = [a, b, c];

describe('isOptimisticId', () => {
  it('recognises a client-minted id', () => {
    expect(isOptimisticId('optimistic-1234')).toBe(true);
    expect(isOptimisticId(a.id)).toBe(false);
  });
});

describe('reorderPayload', () => {
  it('returns the new id order for a real move', () => {
    expect(reorderPayload([c, a, b], current)).toEqual([c.id, a.id, b.id]);
  });

  it('ignores a drop that changed nothing', () => {
    expect(reorderPayload([a, b, c], current)).toBeNull();
  });

  // A drop resolved against stale cell offsets can come back with a hole where
  // an item should be — mapping it straight to ids would throw.
  it('ignores a snapshot with a hole in it', () => {
    expect(reorderPayload([c, undefined, b], current)).toBeNull();
  });

  it('ignores a snapshot of a different length', () => {
    expect(reorderPayload([c, a], current)).toBeNull();
    expect(reorderPayload([c, a, b, a], current)).toBeNull();
  });

  // The server has never seen an optimistic id; it fails UUID validation.
  it('ignores an order containing a row that has no server id yet', () => {
    const pending = { id: 'optimistic-9999' };
    expect(reorderPayload([pending, a, b], [a, b, pending])).toBeNull();
  });

  it('handles an empty list', () => {
    expect(reorderPayload([], [])).toBeNull();
  });
});
