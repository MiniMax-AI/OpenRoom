/**
 * Mystery App — shared types.
 *
 * The OpenRoom UI is pure presentation + action dispatch. The LOCKED truth
 * (killer, motive, weapon, method) lives in the GM subprocess at
 * ws://localhost:5182 — we just render whatever narrative it sends back.
 */

export type SuspectId = 'priya' | 'jake' | 'mira' | 'cole' | 'aiden';
export type LocationId = 'study' | 'balcony' | 'bar' | 'upstairs_bathroom';

export type SuspectDemeanor = 'calm' | 'nervous' | 'defensive' | 'evasive' | 'rattled' | 'cold';

export interface Suspect {
  id: SuspectId;
  name: string;
  role: string;
  blurb: string;
}

export interface GameLocation {
  id: LocationId;
  name: string;
  hint: string;
}

export interface EvidenceItem {
  id: string;
  description: string;
  source?: string;
  unlocked_at: number;
}

export type ChatAuthor = 'kayley' | 'steven';

export interface ChatEntry {
  id: string;
  kind: 'narrative' | 'action' | 'system' | 'error' | 'chat';
  text: string;
  suspect_id?: SuspectId;
  location_id?: LocationId;
  author?: ChatAuthor;
  ts: number;
}

export interface AccusationPayload {
  killer_id: SuspectId;
  motive: string;
  weapon: string;
  method: string;
}

/**
 * The GM response shape. All fields optional — the GM decides which layers
 * light up on any given action (narrative is always present; evidence_unlocked
 * + suspect_demeanor appear situationally; game_over fires on MAKE_ACCUSATION).
 */
export interface GMResponse {
  narrative: string;
  evidence_unlocked?: EvidenceItem[];
  suspect_demeanor?: Partial<Record<SuspectId, SuspectDemeanor>>;
  game_over?: {
    correct: boolean;
    solution: AccusationPayload;
    reveal: string;
  };
  error?: string;
}

/** Outbound action envelope sent to the GM over WebSocket. */
export interface MysteryActionRequest {
  action_type: string;
  action_id: number;
  params: Record<string, string | number | boolean | undefined>;
  ts: number;
}

export interface MysteryActionResponse extends GMResponse {
  action_id?: number;
}
