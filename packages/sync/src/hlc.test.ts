import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { manualClock } from '@mnemo/core';
import {
  compareEncoded,
  compareHlc,
  createHlcClock,
  decodeHlc,
  encodeHlc,
  hlcFromMillis,
  isHlc,
  maxEncoded,
  ZERO_HLC,
} from './hlc';

const arbHlc = fc.record({
  wall: fc.integer({ min: 0, max: 9_999_999_999_999 }),
  counter: fc.integer({ min: 0, max: 0xffff }),
  node: fc.stringMatching(/^[a-z0-9-]{0,12}$/),
});

describe('hlc encoding', () => {
  it('round-trips', () => {
    fc.assert(
      fc.property(arbHlc, (h) => {
        expect(decodeHlc(encodeHlc(h))).toEqual(h);
      }),
    );
  });

  it('string order equals HLC order (total order)', () => {
    fc.assert(
      fc.property(arbHlc, arbHlc, (a, b) => {
        const byStruct = Math.sign(compareHlc(a, b));
        const byString = Math.sign(compareEncoded(encodeHlc(a), encodeHlc(b)));
        expect(byString).toBe(byStruct);
        expect(Math.sign(compareHlc(b, a))).toBe(-byStruct);
      }),
    );
  });

  it('has the documented layout and rejects garbage', () => {
    expect(encodeHlc({ wall: 1_700_000_000_000, counter: 26, node: 'dev-1' })).toBe(
      '1700000000000-001a-dev-1',
    );
    expect(() => decodeHlc('nope')).toThrow();
    expect(isHlc(ZERO_HLC)).toBe(true);
    expect(isHlc('x')).toBe(false);
    expect(hlcFromMillis(5)).toBe('0000000000005-0000-');
    expect(maxEncoded(hlcFromMillis(1), hlcFromMillis(2))).toBe(hlcFromMillis(2));
    expect(maxEncoded(hlcFromMillis(3), hlcFromMillis(2))).toBe(hlcFromMillis(3));
  });
});

describe('hlc clock', () => {
  it('is strictly monotonic whatever the wall clock does', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -10_000_000, max: 10_000_000 }), { maxLength: 60 }),
        (jumps) => {
          const clock = manualClock(1_700_000_000_000);
          const hlc = createHlcClock(clock, 'a');
          let prev = hlc.now();
          for (const j of jumps) {
            clock.advance(j);
            const next = hlc.now();
            expect(compareEncoded(next, prev)).toBe(1);
            prev = next;
          }
        },
      ),
    );
  });

  it('receive dominates both the local and the remote clock', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e12 }),
        arbHlc,
        fc.array(fc.integer({ min: -5000, max: 5000 }), { maxLength: 10 }),
        (start, remote, jumps) => {
          const clock = manualClock(start);
          const hlc = createHlcClock(clock, 'local');
          for (const j of jumps) {
            clock.set(Math.max(0, clock.now() + j));
            hlc.now();
          }
          const before = hlc.peek();
          const r = encodeHlc(remote);
          const after = hlc.receive(r);
          expect(compareHlc(decodeHlc(after), decodeHlc(before))).toBe(1);
          const ra = decodeHlc(after);
          expect(compareHlc({ ...ra, node: '' }, { ...remote, node: '' })).toBe(1);
          expect(compareEncoded(hlc.now(), r)).toBe(1);
        },
      ),
    );
  });

  it('orders writes after a remote clock that runs hours ahead', () => {
    const clock = manualClock(1_000_000);
    const hlc = createHlcClock(clock, 'late');
    const remote = encodeHlc({ wall: 1_000_000 + 3 * 3_600_000, counter: 3, node: 'early' });
    hlc.receive(remote);
    clock.advance(10);
    expect(compareEncoded(hlc.now(), remote)).toBe(1);
  });

  it('resumes from an initial value and overflows the counter into the wall', () => {
    const clock = manualClock(0);
    const hlc = createHlcClock(clock, 'n', encodeHlc({ wall: 50, counter: 0xffff, node: 'n' }));
    expect(decodeHlc(hlc.now())).toEqual({ wall: 51, counter: 0, node: 'n' });
    const other = createHlcClock(manualClock(10), 'm');
    expect(decodeHlc(other.receive(encodeHlc({ wall: 5, counter: 1, node: 'x' })))).toEqual({
      wall: 10,
      counter: 0,
      node: 'm',
    });
  });
});
