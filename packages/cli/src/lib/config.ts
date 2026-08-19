import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const SENSEI_HOME = process.env.SENSEI_HOME || join(homedir(), '.sensei');

// 读 ~/.sensei/.env（KEY=VALUE，一行一个），只补齐、不覆盖已有环境变量。
export function loadDotEnv(): void {
  const file = join(SENSEI_HOME, '.env');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

export interface SenseiConfig {
  geminiApiKey: string | undefined;
  model: string;
  cheapModel: string;
  serviceAccountPath: string;
  projectId: string | undefined;
  proxy: string | undefined;
  cloudEnabled: boolean;
}

export function loadConfig(): SenseiConfig {
  loadDotEnv();
  const serviceAccountPath = process.env.SENSEI_SERVICE_ACCOUNT || join(SENSEI_HOME, 'service-account.json');
  let projectId = process.env.SENSEI_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId && existsSync(serviceAccountPath)) {
    try {
      projectId = JSON.parse(readFileSync(serviceAccountPath, 'utf8')).project_id;
    } catch {
      /* ignore */
    }
  }
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.SENSEI_PROXY;
  return {
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    model: process.env.SENSEI_MODEL || 'gemini-3.7-flash',
    cheapModel: process.env.SENSEI_CHEAP_MODEL || 'gemma-4-26b-a4b-it',
    serviceAccountPath,
    projectId,
    proxy,
    cloudEnabled: process.env.SENSEI_CLOUD !== '0' && existsSync(serviceAccountPath),
  };
}
