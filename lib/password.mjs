import crypto from "node:crypto";

/** Хеш пароля через scrypt (встроенный crypto, без bcrypt). */
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(plain), salt, 32);
  return salt.toString("hex") + ":" + key.toString("hex");
}

export function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  const [s, h] = stored.split(":");
  if (!s || !h) return false;
  const salt = Buffer.from(s, "hex");
  const expected = Buffer.from(h, "hex");
  if (expected.length !== 32) return false;
  const key = crypto.scryptSync(String(plain), salt, 32);
  return crypto.timingSafeEqual(key, expected);
}
