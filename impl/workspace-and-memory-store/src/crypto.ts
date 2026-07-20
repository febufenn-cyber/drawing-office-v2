// Local-first cryptography: per-workspace key derivation and AEAD at rest.
// Stdlib crypto only. The master key never leaves the process; a workspace data
// key is HKDF-derived and deterministic in the workspace id.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export function deriveKey(master: Buffer, workspace_id: string, info: string): Buffer {
  const salt = Buffer.from(workspace_id, 'utf8');
  const dk = hkdfSync('sha256', master, salt, Buffer.from(info, 'utf8'), 32);
  return Buffer.from(dk);
}

export interface Sealed {
  readonly iv: string;
  readonly ct: string;
  readonly tag: string;
}

// AES-256-GCM. The output carries only ciphertext, iv, and tag — never plaintext.
export function seal(key: Buffer, plaintext: string): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return { iv: iv.toString('hex'), ct: ct.toString('hex'), tag: c.getAuthTag().toString('hex') };
}

// Returns null on any authentication or format failure — including a wrong key,
// which is how a zeroized workspace's partition reads as unrecoverable.
export function open(key: Buffer, s: Sealed): string | null {
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(s.iv, 'hex'));
    d.setAuthTag(Buffer.from(s.tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(s.ct, 'hex')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
