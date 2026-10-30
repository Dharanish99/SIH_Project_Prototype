import {
  generateKeyPairSync,
  sign,
  verify,
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ISSUER = "SETUTRACE_SYNTHETIC_ISSUER";
export function loadSigningKeys(filename?: string) {
  let privateKey: KeyObject;
  if (filename && existsSync(filename))
    privateKey = createPrivateKey(readFileSync(filename));
  else {
    privateKey = generateKeyPairSync("ed25519").privateKey;
    if (filename) {
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(
        filename,
        privateKey.export({ type: "pkcs8", format: "pem" }),
        { mode: 0o600, flag: "wx" },
      );
    }
  }
  if (privateKey.asymmetricKeyType !== "ed25519")
    throw new Error("The demo issuer requires an Ed25519 key.");
  const publicKey = createPublicKey(privateKey);
  const keyId = createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex")
    .slice(0, 16);
  return { privateKey, publicKey, keyId };
}
export function signAssertion(payload: object, key: KeyObject, keyId: string) {
  const h = Buffer.from(
    JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: keyId }),
  ).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${h}.${p}.${sign(null, Buffer.from(`${h}.${p}`), key).toString("base64url")}`;
}
export function signatureValid(token: string, key: KeyObject) {
  try {
    const [h, p, s, ...rest] = token.split(".");
    if (rest.length || !h || !p || !s) return false;
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    return (
      header.alg === "EdDSA" &&
      header.typ === "JWT" &&
      verify(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"))
    );
  } catch {
    return false;
  }
}
