import { describe, expect, it } from "vitest";
import { parseQuickConnect } from "./quickConnect";

describe("parseQuickConnect", () => {
  it("returns null for empty or whitespace input", () => {
    expect(parseQuickConnect("")).toBeNull();
    expect(parseQuickConnect("   ")).toBeNull();
  });

  it("parses host only with default username and port", () => {
    expect(parseQuickConnect("example.com")).toEqual({
      username: "root",
      host: "example.com",
      port: 22,
    });
  });

  it("parses host:port", () => {
    expect(parseQuickConnect("example.com:2222")).toEqual({
      username: "root",
      host: "example.com",
      port: 2222,
    });
  });

  it("parses user@host", () => {
    expect(parseQuickConnect("admin@example.com")).toEqual({
      username: "admin",
      host: "example.com",
      port: 22,
    });
  });

  it("parses user@host:port", () => {
    expect(parseQuickConnect("deploy@10.0.0.1:8022")).toEqual({
      username: "deploy",
      host: "10.0.0.1",
      port: 8022,
    });
  });

  it("trims whitespace around input", () => {
    expect(parseQuickConnect("  admin@host  ")).toEqual({
      username: "admin",
      host: "host",
      port: 22,
    });
  });

  it("returns null when username is empty before @", () => {
    expect(parseQuickConnect("@example.com")).toBeNull();
  });

  it("returns null when host is empty after @", () => {
    expect(parseQuickConnect("user@")).toBeNull();
  });

  it("returns null for invalid port", () => {
    expect(parseQuickConnect("host:abc")).toBeNull();
    expect(parseQuickConnect("host:0")).toBeNull();
    expect(parseQuickConnect("host:99999")).toBeNull();
  });

  it("parses IPv6 addresses in bracket notation", () => {
    expect(parseQuickConnect("user@[::1]:2222")).toEqual({
      username: "user",
      host: "::1",
      port: 2222,
    });
  });

  it("parses IPv6 address without port", () => {
    expect(parseQuickConnect("[::1]")).toEqual({
      username: "root",
      host: "::1",
      port: 22,
    });
  });

  it("returns null for malformed IPv6 (missing close bracket)", () => {
    expect(parseQuickConnect("[::1")).toBeNull();
  });

  it("accepts edge port values", () => {
    expect(parseQuickConnect("host:1")).toEqual({
      username: "root",
      host: "host",
      port: 1,
    });
    expect(parseQuickConnect("host:65535")).toEqual({
      username: "root",
      host: "host",
      port: 65535,
    });
  });
});
