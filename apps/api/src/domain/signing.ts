/**
 * Digital signatures (FR16).
 *
 * What is signed is the event hash, not the report. The chain already covers every recorded
 * observation and links each entry to the one before, so a signature over the latest hash
 * commits the signer to the whole history up to that point. Signing a rendered document
 * instead would commit them to a projection, and a projection can be rebuilt.
 *
 * **Where the private key lives is the whole question**, and this module is arranged so the
 * answer can change without the rest moving. Verification takes a detached signature and a
 * public key; it does not care whether the signature was produced by a hardware DSC token in
 * the officer's hand, by an eSign gateway, or — in a demonstration — by a key this process
 * generated. Only the last of those is implemented here, and it is labelled as such: a server
 * that can sign on an officer's behalf is not a signature, it is a log entry with extra steps.
 *
 * Legal footing: sections 4 and 5 of the Information Technology Act, 2000 give electronic
 * records the standing of writing, and a signature produced by a secure asymmetric process the
 * standing of a handwritten one. Ed25519 is the asymmetric process here.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";

export interface KeyPair {
  /** SPKI, PEM-encoded. Stored on the user record and published with the report. */
  publicKeyPem: string;
  /** PKCS#8, PEM-encoded. In a real deployment this never leaves the signer's device. */
  privateKeyPem: string;
}

/**
 * Generate an Ed25519 key pair.
 *
 * Present for the demonstration and for tests. A deployment registers the public half of a key
 * whose private half is held on a DSC token; nothing here would change.
 */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/**
 * Sign an event hash, returning a base64 detached signature.
 *
 * Ed25519 signs the message directly — no separate digest step — so the hex hash string is
 * signed as bytes exactly as it is stored.
 */
export function signHash(hashHex: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  return nodeSign(null, Buffer.from(hashHex, "utf8"), key).toString("base64");
}

export interface VerificationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verify a detached signature over an event hash.
 *
 * Returns a result rather than throwing: a signature that does not verify is a finding to be
 * reported on the audit page, not an exception to be swallowed somewhere up the stack.
 */
export function verifySignature(
  hashHex: string,
  signatureBase64: string,
  publicKeyPem: string,
): VerificationResult {
  let key;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    return { ok: false, reason: "The signer's public key is not readable." };
  }

  let sig: Buffer;
  try {
    sig = Buffer.from(signatureBase64, "base64");
    if (sig.length === 0) return { ok: false, reason: "The signature is empty." };
  } catch {
    return { ok: false, reason: "The signature is not valid base64." };
  }

  try {
    const ok = nodeVerify(null, Buffer.from(hashHex, "utf8"), key, sig);
    return ok
      ? { ok: true }
      : {
          ok: false,
          reason:
            "The signature does not match this record under the signer's registered key. " +
            "Either the record changed after signing, or it was not signed by that officer.",
        };
  } catch (err) {
    return { ok: false, reason: `Signature could not be checked: ${(err as Error).message}` };
  }
}

/** A signed step of the approval chain, as the report prints it. */
export interface SignatureRecord {
  eventVersion: number;
  eventType: string;
  actorId: string;
  actorName: string;
  role: string;
  recordedAt: string;
  hash: string;
  signature: string;
  verified: boolean;
  /**
   * Signed under a key the officer has since replaced.
   *
   * Not a failure. A signature made with a key that was valid at the time stays valid, and
   * verification is done against the key recorded with the signature. This says only that the
   * officer's *current* key is a different one — a renewed DSC, a replaced device — which a
   * reader may want to know without it being reported as tampering.
   */
  keyRotated?: boolean;
  reason?: string;
}
