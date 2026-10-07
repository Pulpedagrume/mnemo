import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { Rng } from '@mnemo/core';

/** API tokens start with this prefix so they are easy to recognise (and to scan for leaks). */
export const API_TOKEN_PREFIX = 'mnemo_';

/** Cryptographically secure Rng, for identifiers. */
export const cryptoRng: Rng = { next: () => randomInt(0, 2 ** 32) / 2 ** 32 };

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function newApiToken(): string {
  return `${API_TOKEN_PREFIX}${randomToken(32)}`;
}

/**
 * Keyed hash of a secret (session id, API token, invite code). Only this hash is stored, so a
 * leaked database does not leak usable credentials; the key (SESSION_SECRET) is never stored there.
 */
export function secretHash(key: string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** OWASP-recommended argon2id parameters (19 MiB, 2 iterations). */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  // @node-rs/argon2 defaults to argon2id.
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** A valid hash of a random password, verified when the email is unknown (constant-ish timing). */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomToken(16));
  return dummyHash;
}
