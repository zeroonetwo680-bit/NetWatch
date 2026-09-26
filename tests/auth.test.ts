import { describe, expect, it } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import {
  canAccessDevice,
  hashPassword,
  normalizeUsername,
  verifyPassword,
} from "@/server/auth";

const SECRET = new TextEncoder().encode("netwatch-test-secret-0123456789");

async function sign(claims: Record<string, unknown>, ttl = "60s") {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.sub ?? "1"))
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(SECRET);
}

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const hash = hashPassword("admin123");
    expect(hash).not.toBe("admin123");
    expect(verifyPassword("admin123", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("does not crash on a malformed hash", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("username normalization", () => {
  it("lowercases and trims", () => {
    expect(normalizeUsername("  Admin  ")).toBe("admin");
  });
});

describe("session tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await sign({ name: "مدير", username: "admin", role: "admin" });
    const { payload } = await jwtVerify(token, SECRET);
    expect(payload.role).toBe("admin");
    expect(payload.username).toBe("admin");
  });

  it("rejects an expired token", async () => {
    const token = await sign({ role: "admin" }, "-10s");
    await expect(jwtVerify(token, SECRET)).rejects.toThrow();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode("a-completely-different-secret-key"));
    await expect(jwtVerify(token, SECRET)).rejects.toThrow();
  });
});

describe("canAccessDevice", () => {
  const admin = { id: 1, name: "a", username: "a", role: "admin" as const };
  const user = { id: 2, name: "u", username: "u", role: "user" as const };

  it("lets admins reach every device", () => {
    expect(canAccessDevice(admin, { id: 7, userId: null })).toBe(true);
    expect(canAccessDevice(admin, { id: 7, userId: 2 })).toBe(true);
  });

  it("lets users reach only their own devices", () => {
    expect(canAccessDevice(user, { id: 7, userId: 2 })).toBe(true);
    expect(canAccessDevice(user, { id: 7, userId: 3 })).toBe(false);
    expect(canAccessDevice(user, { id: 7, userId: null })).toBe(false);
  });

  it("never lets a user access bcrypt-hashed rows by id collision", () => {
    // Guard against regressions that compare the wrong field.
    expect(canAccessDevice(user, { id: 2, userId: null })).toBe(false);
  });
});
