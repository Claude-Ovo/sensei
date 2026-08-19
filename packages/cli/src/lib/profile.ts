import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostname, userInfo } from 'node:os';
import { createHash } from 'node:crypto';
import { SENSEI_HOME } from './config.js';

/**
 * 学习者画像：agent 根据反馈慢慢调的那几个旋钮。
 * 本地一份（离线也能用），云端 learners/{id} 一份（面板看）。
 */
export interface LearnerProfile {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** 话多话少：terse / normal / detailed */
  verbosity: 'terse' | 'normal' | 'detailed';
  /** 自评水平：beginner / intermediate / advanced */
  level: 'beginner' | 'intermediate' | 'advanced';
  /** 偏好：先给答案 vs 先给线索 */
  style: 'answer-first' | 'hint-first';
  /** 已经会的概念，别再解释 */
  knownConcepts: string[];
  /** 反复栽跟头的地方 */
  weakSpots: string[];
  /** 语言 */
  language: string;
  /** 反馈计数 */
  feedback: Record<string, number>;
  /** agent 自由记录的一句话印象 */
  impression?: string;
}

const FILE = join(SENSEI_HOME, 'profile.json');

export function defaultProfile(): LearnerProfile {
  const seed = `${hostname()}:${safeUser()}`;
  const id = createHash('sha256').update(seed).digest('hex').slice(0, 16);
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    verbosity: 'normal',
    level: 'intermediate',
    style: 'hint-first',
    knownConcepts: [],
    weakSpots: [],
    language: process.env.SENSEI_LANG || 'zh-CN',
    feedback: {},
  };
}

function safeUser(): string {
  try {
    return userInfo().username;
  } catch {
    return 'user';
  }
}

export function loadProfile(): LearnerProfile {
  if (!existsSync(FILE)) {
    const p = defaultProfile();
    saveProfile(p);
    return p;
  }
  try {
    return { ...defaultProfile(), ...JSON.parse(readFileSync(FILE, 'utf8')) };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: LearnerProfile): void {
  mkdirSync(SENSEI_HOME, { recursive: true });
  p.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(p, null, 2));
}

/** 反馈 → 旋钮。规则很朴素，agent 也可以直接改画像字段。 */
export function applyFeedback(p: LearnerProfile, value: string): LearnerProfile {
  p.feedback[value] = (p.feedback[value] ?? 0) + 1;
  switch (value) {
    case 'too-basic':
      if (p.verbosity === 'detailed') p.verbosity = 'normal';
      else p.verbosity = 'terse';
      if (p.level === 'beginner') p.level = 'intermediate';
      else if (p.level === 'intermediate' && (p.feedback['too-basic'] ?? 0) >= 2) p.level = 'advanced';
      break;
    case 'too-deep':
    case 'confusing':
      if (p.verbosity === 'terse') p.verbosity = 'normal';
      else p.verbosity = 'detailed';
      if (p.level === 'advanced') p.level = 'intermediate';
      else if (p.level === 'intermediate' && (p.feedback[value] ?? 0) >= 2) p.level = 'beginner';
      break;
    case 'just-tell-me':
      p.style = 'answer-first';
      break;
    case 'let-me-try':
      p.style = 'hint-first';
      break;
    default:
      break;
  }
  return p;
}

export function describeProfile(p: LearnerProfile): string {
  return [
    `level=${p.level}`,
    `verbosity=${p.verbosity}`,
    `style=${p.style}`,
    `language=${p.language}`,
    p.knownConcepts.length ? `known=[${p.knownConcepts.slice(-12).join(', ')}]` : '',
    p.weakSpots.length ? `weak=[${p.weakSpots.slice(-8).join(', ')}]` : '',
    p.impression ? `impression="${p.impression}"` : '',
  ]
    .filter(Boolean)
    .join('; ');
}
