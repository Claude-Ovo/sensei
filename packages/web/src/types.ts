import type { Timestamp } from 'firebase/firestore';

export type SessionState = 'active' | 'ended' | 'compiled';
export type SessionStatus = 'flowing' | 'exploring' | 'stuck' | 'idle' | 'milestone' | 'done';
export type HintLevel = 'nudge' | 'hint' | 'explain' | 'fix';
export type ChunkKind = 'out' | 'in' | 'meta' | 'agent' | 'user';

export interface LearnerProfile {
  level?: string;
  verbosity?: string;
  style?: string;
  knownConcepts?: string[];
  weakSpots?: string[];
}

export interface SessionData {
  id: string;
  goal: string | null;
  state: SessionState;
  status?: SessionStatus;
  lastObservation?: string;
  updatedAt?: Timestamp;
  lastSeq: number;
  ownerEmail?: string | null;
  public?: boolean;
  profile?: LearnerProfile;
  tutorial?: string;
}

export interface ChunkData {
  id: string;
  seq: number;
  kind: ChunkKind;
  text: string;
}

export interface HintData {
  id: string;
  level: HintLevel;
  text: string;
  evidence?: string;
  atSeq: number;
}

export interface NoteData {
  id: string;
  text: string;
  kind: 'note' | 'milestone';
  atSeq?: number | null;
}

export interface QuestionData {
  id: string;
  text: string;
  atSeq: number;
  answer: string | null;
}
