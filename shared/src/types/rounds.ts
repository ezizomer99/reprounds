import type { DisciplineCat, GiType } from './enums';

/**
 * Category-aware "rounds session" model, stored in `session_entries.details`
 * for martial-arts entries. One engine that branches on the discipline's
 * category (grappling | striking | mixed). Tagged with `schema` so the app can
 * tell a structured rounds session apart from a legacy field_config payload and
 * fall back to the generic renderer when the tag is absent.
 */

export const ROUNDS_SCHEMA = 'rounds.v1' as const;

export type RoundIntensity = 'light' | 'medium' | 'hard';

/** Class / session format — cross-cutting across all combat sports. */
export type ClassType =
  | 'technique'
  | 'sparring'
  | 'open_mat'
  | 'open_gym'
  | 'private'
  | 'competition_prep'
  | 'conditioning';

/** Striking weapons. Boxing uses the first four; Muay Thai adds the rest. */
export type StrikeWeapon =
  | 'jab'
  | 'cross'
  | 'hook'
  | 'uppercut'
  | 'teep'
  | 'roundhouse'
  | 'knee'
  | 'elbow';

export type StrikeCounts = Partial<Record<StrikeWeapon, number>>;

/** What a striking round was spent on. */
export type StrikingRoundType =
  | 'shadow'
  | 'bag'
  | 'pads'
  | 'sparring'
  | 'clinch'
  | 'drilling';

/** MMA round phases. */
export type MmaPhase = 'standup' | 'clinch' | 'ground';

interface BaseRound {
  /** Local id for list rendering and in-place editing within the entry. */
  id: string;
  durationSeconds?: number | null;
  intensity?: RoundIntensity | null;
  /** References a row in `partners` (added separately); null for solo/unknown. */
  partnerId?: string | null;
  notes?: string | null;
}

export interface GrapplingRound extends BaseRound {
  gi?: GiType | null;
  submissionsFor?: number;
  submissionsAgainst?: number;
  sweeps?: number;
  takedowns?: number;
  /** Positions worked, e.g. ['mount', 'back', 'half_guard']. */
  positions?: string[];
}

export interface StrikingRound extends BaseRound {
  roundType?: StrikingRoundType | null;
  gloveOz?: number | null;
  strikes?: StrikeCounts;
  /** Combinations drilled, e.g. ['1-2-3', 'jab-low kick']. */
  combinations?: string[];
  defensiveReps?: number;
}

export interface MmaRound extends BaseRound {
  /** Which phases this round covered. */
  phases?: MmaPhase[];
  takedownsAttempted?: number;
  takedownsLanded?: number;
  takedownsDefended?: number;
  groundAndPound?: number;
  scrambles?: number;
  // Reuses both striking and grappling counters within a single round.
  strikes?: StrikeCounts;
  submissionsFor?: number;
  submissionsAgainst?: number;
}

interface RoundsSessionBase {
  schema: typeof ROUNDS_SCHEMA;
  classType?: ClassType | null;
  /** Free-form technique journal for the session. */
  techniqueNotes?: string | null;
  /**
   * Lowercased technique tags for the session, e.g. ['knee cut', 'triangle'].
   * Stored inside the details JSONB (no dedicated table); filterable on the
   * notes timeline and countable in mat stats.
   */
  techniqueTags?: string[];
}

/**
 * Discriminated on `category` so UI and aggregation can switch on a single
 * field to get the correctly-typed `rounds` array.
 */
export type RoundsSessionDetails =
  | (RoundsSessionBase & { category: 'grappling'; rounds: GrapplingRound[] })
  | (RoundsSessionBase & { category: 'striking'; rounds: StrikingRound[] })
  | (RoundsSessionBase & { category: 'mixed'; rounds: MmaRound[] });

/** Map a discipline category to its round content type. */
export type RoundFor<C extends DisciplineCat> = C extends 'grappling'
  ? GrapplingRound
  : C extends 'striking'
    ? StrikingRound
    : MmaRound;

/** True when an entry's `details` is a structured rounds session (vs legacy field_config). */
export function isRoundsSession(details: unknown): details is RoundsSessionDetails {
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { schema?: unknown }).schema === ROUNDS_SCHEMA
  );
}
