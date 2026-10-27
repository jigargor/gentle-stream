import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRequestOrigin, hasTrustedOrigin } from "@/lib/security/origin";

describe("hasTrustedOrigin", () => {
  it("allows missing Origin header", () => {
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
    });
    expect(hasTrustedOrigin(request)).toBe(true);
  });

  it("allows loopback alias when request URL uses localhost but Origin uses 127.0.0.1", () => {
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
      },
    });
    expect(hasTrustedOrigin(request)).toBe(true);
  });

  it("allows loopback alias when request URL uses 127.0.0.1 but Origin uses localhost", () => {
    const request = new NextRequest("http://127.0.0.1:3000/api/auth/guest-access", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://localhost:3000",
      },
    });
    expect(hasTrustedOrigin(request)).toBe(true);
  });

  it("rejects unrelated origins", () => {
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "https://evil.example",
      },
    });
    expect(hasTrustedOrigin(request)).toBe(false);
  });
});

describe("getRequestOrigin", () => {
  it("prefers Host header over internal request URL", () => {
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
      headers: { host: "127.0.0.1:3000" },
    });
    expect(getRequestOrigin(request)).toBe("http://127.0.0.1:3000");
  });
});
