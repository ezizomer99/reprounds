import {
  mondayOf,
  mondayISO,
  nextMondayISO,
  weekKey,
  computeWeekStreak,
  weeksAgoMonday,
  avgPerWeekFromBuckets,
  weeklyBarLabel,
  statsRange,
  STATS_RANGES,
  bodyScale,
  BODY_BASE_SIZE,
} from './statsHelpers';

/** Local `YYYY-MM-DD` — the convention every helper in this module uses. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO date of the Monday n full weeks before the current Monday. */
function mondayNWeeksAgo(n: number): string {
  const mon = mondayOf(new Date());
  mon.setDate(mon.getDate() - n * 7);
  return isoDate(mon);
}


// ─── computeWeekStreak ─────────────────────────────────────────────────────────

describe('computeWeekStreak', () => {
  it('returns 0 when there are no sessions', () => {
    expect(computeWeekStreak([])).toBe(0);
  });

  it('returns 1 for sessions only in the current week', () => {
    expect(computeWeekStreak([mondayNWeeksAgo(0)])).toBe(1);
  });

  it('counts sessions in the same week only once (de-duplicates by week)', () => {
    // Two dates both in the same week map to the same week key → streak = 1
    expect(computeWeekStreak([mondayNWeeksAgo(0), mondayNWeeksAgo(0)])).toBe(1);
  });

  it('counts consecutive weeks', () => {
    const dates = [mondayNWeeksAgo(0), mondayNWeeksAgo(1), mondayNWeeksAgo(2)];
    expect(computeWeekStreak(dates)).toBe(3);
  });

  it('breaks the streak at a missing week', () => {
    // This week and 2 weeks ago, but last week is absent
    const dates = [mondayNWeeksAgo(0), mondayNWeeksAgo(2)];
    expect(computeWeekStreak(dates)).toBe(1);
  });

  it('applies grace for the current week not yet trained', () => {
    // Only last week's session; no session this week → grace keeps streak at 1
    expect(computeWeekStreak([mondayNWeeksAgo(1)])).toBe(1);
  });

  it('breaks after last week when neither this week nor last week has a session', () => {
    // Only a session 2 weeks ago → grace covers w=0, then w=1 has no session → break
    expect(computeWeekStreak([mondayNWeeksAgo(2)])).toBe(0);
  });
});

// ─── local-date convention ────────────────────────────────────────────────────

// mondayISO and weekKey are compared against each other by callers (MyWeek's
// weekCount, the stats tab's muscle window). toISOString() converts to UTC
// first, so a local Monday 00:00 formatted that way lands on the previous
// Sunday anywhere ahead of UTC — these pin both to the local convention.
describe('mondayISO / weekKey', () => {
  it('returns a Monday in local time', () => {
    const parsed = new Date(mondayISO() + 'T00:00:00');
    expect(parsed.getDay()).toBe(1);
  });

  it('agrees with mondayOf formatted locally', () => {
    expect(mondayISO()).toBe(isoDate(mondayOf(new Date())));
  });

  it('maps every day of the current week to the same key', () => {
    const monday = mondayOf(new Date());
    const keys = new Set(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return weekKey(isoDate(d));
      }),
    );
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe(mondayISO());
  });
});

// ─── nextMondayISO ────────────────────────────────────────────────────────────

// The exclusive upper bound callers send as `until`. The server windows filtered
// `date >= since` only, so a session dated ahead of the window counted inside it.
describe('nextMondayISO', () => {
  it('returns a Monday in local time', () => {
    expect(new Date(nextMondayISO() + 'T00:00:00').getDay()).toBe(1);
  });

  it('is exactly 7 days after mondayISO', () => {
    const start = new Date(mondayISO() + 'T00:00:00');
    const end = new Date(nextMondayISO() + 'T00:00:00');
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(7);
  });

  it('brackets every day of the current week', () => {
    const start = mondayISO();
    const end = nextMondayISO();
    const monday = mondayOf(new Date());
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      expect(isoDate(d) >= start).toBe(true);
      expect(isoDate(d) < end).toBe(true);
    }
  });

  it('excludes next Monday itself', () => {
    const monday = mondayOf(new Date());
    const nextMon = new Date(monday);
    nextMon.setDate(monday.getDate() + 7);
    expect(isoDate(nextMon) < nextMondayISO()).toBe(false);
  });
});

// ─── weeksAgoMonday ───────────────────────────────────────────────────────────

describe('weeksAgoMonday', () => {
  it('returns the current Monday for weeks = 1', () => {
    const mon = mondayOf(new Date());
    const y = mon.getFullYear();
    const m = String(mon.getMonth() + 1).padStart(2, '0');
    const d = String(mon.getDate()).padStart(2, '0');
    expect(weeksAgoMonday(1)).toBe(`${y}-${m}-${d}`);
  });

  it('returns a Monday 7 weeks back for the default 8-week window', () => {
    const result = weeksAgoMonday();
    const parsed = new Date(result + 'T00:00:00');
    expect(parsed.getDay()).toBe(1); // Monday
    const diffDays = Math.round((mondayOf(new Date()).getTime() - parsed.getTime()) / 86_400_000);
    expect(diffDays).toBe(49);
  });

  // The anchor is a parameter so a caller holding this in a query key can
  // re-derive it at midnight; frozen at mount it kept charting last week.
  it('anchors on the supplied date rather than today', () => {
    const anchor = new Date();
    anchor.setDate(anchor.getDate() - 7 * 3);
    const result = weeksAgoMonday(1, anchor);
    expect(result).toBe(isoDate(mondayOf(anchor)));
  });

  it('moves the window when the anchor crosses into a new week', () => {
    const thisWeek = mondayOf(new Date());
    const lastWeek = new Date(thisWeek);
    lastWeek.setDate(thisWeek.getDate() - 7);
    expect(weeksAgoMonday(8, thisWeek)).not.toBe(weeksAgoMonday(8, lastWeek));
  });
});


// ─── STATS_RANGES / statsRange ────────────────────────────────────────────────

describe('statsRange', () => {
  it('resolves every advertised key', () => {
    for (const r of STATS_RANGES) {
      expect(statsRange(r.key).weeks).toBe(r.weeks);
    }
  });

  it('falls back to 8 weeks for an unrecognised key', () => {
    expect(statsRange('nonsense' as never).weeks).toBe(8);
  });

  // The server clamps to MAX_WEEKS = 52. A range asking for more would render a
  // label promising a window the response doesn't contain.
  it('never offers a range wider than the server will serve', () => {
    for (const r of STATS_RANGES) expect(r.weeks).toBeLessThanOrEqual(52);
  });

  it('lists ranges shortest to longest', () => {
    const weeks = STATS_RANGES.map((r) => r.weeks);
    expect([...weeks].sort((a, b) => a - b)).toEqual(weeks);
  });
});

// ─── avgPerWeekFromBuckets ────────────────────────────────────────────────────

describe('avgPerWeekFromBuckets', () => {
  it('returns 0 for no buckets and for an untrained window', () => {
    expect(avgPerWeekFromBuckets([])).toBe(0);
    expect(avgPerWeekFromBuckets([{ sessions: 0 }, { sessions: 0 }])).toBe(0);
  });

  it('averages across the window when every week is active', () => {
    expect(avgPerWeekFromBuckets([{ sessions: 2 }, { sessions: 4 }])).toBe(3);
  });

  // Same rule the old session-list helper applied, for the same reason: someone
  // two weeks in who trains twice a week should read 2.0, not 0.2 against a
  // year-long divisor.
  it('divides by the weeks since the first active one, not the whole window', () => {
    const buckets = [
      { sessions: 0 },
      { sessions: 0 },
      { sessions: 0 },
      { sessions: 2 },
      { sessions: 2 },
    ];
    expect(avgPerWeekFromBuckets(buckets)).toBe(2);
  });

  it('counts a rest week after training started', () => {
    expect(avgPerWeekFromBuckets([{ sessions: 4 }, { sessions: 0 }])).toBe(2);
  });

  it('rounds to one decimal', () => {
    expect(avgPerWeekFromBuckets([{ sessions: 1 }, { sessions: 2 }])).toBe(1.5);
    expect(avgPerWeekFromBuckets([{ sessions: 1 }, { sessions: 1 }, { sessions: 2 }])).toBe(1.3);
  });
});

// ─── weeklyBarLabel ───────────────────────────────────────────────────────────

describe('weeklyBarLabel', () => {
  it('always labels the newest bucket "This week"', () => {
    expect(weeklyBarLabel('2026-06-01', 7, 8)).toBe('This\nweek');
    expect(weeklyBarLabel('2026-06-01', 51, 52)).toBe('This\nweek');
  });

  it('labels every bucket at short ranges', () => {
    const labels = Array.from({ length: 8 }, (_, i) => weeklyBarLabel('2026-06-01', i, 8));
    expect(labels.every((l) => l !== '')).toBe(true);
  });

  // 52 labels in a row is an unreadable smear, so wide ranges label every Nth.
  // The count must never *grow* with the window and must stay small at the top
  // end — it does not have to shrink at every step (26 and 52 both land on 7,
  // which is monthly and bi-monthly respectively: both perfectly readable).
  it('never shows more labels as the window widens', () => {
    const shown = (total: number) =>
      Array.from({ length: total }, (_, i) => weeklyBarLabel('2026-06-01', i, total)).filter(
        (l) => l !== '',
      ).length;
    expect(shown(26)).toBeLessThan(shown(8));
    expect(shown(52)).toBeLessThanOrEqual(shown(26));
    expect(shown(52)).toBeLessThanOrEqual(10);
  });

  it('formats a dated label as month and day', () => {
    expect(weeklyBarLabel('2026-06-01', 0, 8)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe('bodyScale', () => {
  const PAD = 18;
  // width × height in dp: a small phone, a current phone, and a tablet.
  const SMALL = [375, 667] as const;
  const PHONE = [393, 852] as const;
  const TABLET = [834, 1194] as const;

  const box = (w: number, h: number) => {
    const s = bodyScale(w, h, PAD);
    return { w: BODY_BASE_SIZE.width * s, h: BODY_BASE_SIZE.height * s };
  };

  // The old flat scale={1.1} was 220 × 440 dp everywhere. This can only shrink.
  it('never renders larger than the fixed size it replaced', () => {
    for (const [w, h] of [SMALL, PHONE, TABLET]) {
      expect(bodyScale(w, h, PAD)).toBeLessThanOrEqual(1.1);
    }
  });

  it('keeps the figure inside the card gutters', () => {
    for (const [w, h] of [SMALL, PHONE, TABLET]) {
      expect(box(w, h).w).toBeLessThanOrEqual(w - 2 * PAD);
    }
  });

  // The whole point: on a phone the body used to eat over half the page.
  it('leaves room for the rest of the page on a phone', () => {
    for (const [w, h] of [SMALL, PHONE]) {
      expect(box(w, h).h).toBeLessThan(h * 0.5);
    }
  });

  it('stays legible on a narrow device rather than shrinking without limit', () => {
    expect(bodyScale(320, 480, PAD)).toBeGreaterThanOrEqual(0.8);
  });

  it('grows with the viewport up to the cap', () => {
    expect(bodyScale(...PHONE, PAD)).toBeGreaterThanOrEqual(bodyScale(...SMALL, PAD));
    expect(bodyScale(...TABLET, PAD)).toBeGreaterThanOrEqual(bodyScale(...PHONE, PAD));
  });
});
