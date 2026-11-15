import { randomBytes } from "crypto";
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
export function createId(len = 20) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
