/**
 * Scenario data for "The Marcus Vale Gala" — the 5 suspects, 4 locations
 * presented in the UI. The LOCKED truth (who/motive/weapon) lives in the GM
 * subprocess only; the UI never sees it until MAKE_ACCUSATION resolves.
 *
 * Source of truth: .claude/skills/mystery-gm/scenarios/marcus-vale-gala-skeleton.json
 * (authored by Kayley 2026-04-15). Keep this file in sync when the skeleton
 * changes — it's a snapshot of the public-facing fields only.
 */

import type { Suspect, GameLocation } from './types';

export const SCENARIO_TITLE = 'The Marcus Vale Gala';
export const SCENARIO_TAGLINE =
  'A tech billionaire dies in his locked study at midnight. Five guests. One killer.';
export const VICTIM_NAME = 'Marcus Vale';
export const VICTIM_ROLE = 'Founder / CEO of Lumin';

export const SUSPECTS: Suspect[] = [
  {
    id: 'priya',
    name: 'Priya Shah',
    role: 'Co-founder, ex-girlfriend',
    blurb: 'Pushed out of the cap table last month. Showed up anyway.',
  },
  {
    id: 'jake',
    name: 'Jake Ostrowski',
    role: 'Head of security',
    blurb: 'Ex-Marine. The one who found the body. Master keycard.',
  },
  {
    id: 'mira',
    name: 'Dr. Mira Chen',
    role: "Marcus's therapist",
    blurb: 'Here as "a friend." Carrying a small leather case she won\'t open.',
  },
  {
    id: 'cole',
    name: 'Cole Reyes',
    role: 'Investigative journalist (uninvited)',
    blurb: 'Blocked from every press list. Got in wearing someone else\'s badge.',
  },
  {
    id: 'aiden',
    name: 'Aiden Park',
    role: 'Lumin CTO',
    blurb: "Marcus's oldest friend. The other master-keycard holder.",
  },
];

export const LOCATIONS: GameLocation[] = [
  {
    id: 'study',
    name: "Marcus's locked study",
    hint: 'Where the body was found — second floor, door bolted from the inside.',
  },
  {
    id: 'balcony',
    name: 'Second-floor balcony',
    hint: 'Open to the cold air. Guests slipped out here to smoke and scheme.',
  },
  {
    id: 'bar',
    name: 'The main bar',
    hint: 'Downstairs. Loud. Everyone passed through at least once.',
  },
  {
    id: 'upstairs_bathroom',
    name: 'Upstairs guest bathroom',
    hint: 'Quieter than the downstairs line. Anyone could have excused themselves.',
  },
];
