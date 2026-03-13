import { describe, it, expect } from "vitest";
import { sessionStore } from "./session";
import type { SessionInfo, SessionId } from "../types/session";

describe("session store", () => {
  it("registers a session", () => {
    const id = { value: "session-1" } as SessionId;
    const info: SessionInfo = {
      id,
      shell: "bash",
      pid: 1234,
      alive: true,
    };
    
    sessionStore.registerSession(info);
    
    const retrieved = sessionStore.getSession(id);
    expect(retrieved).toEqual(info);
  });

  it("removes a session", () => {
    const id = { value: "session-1" } as SessionId;
    
    sessionStore.removeSession(id);
    
    const retrieved = sessionStore.getSession(id);
    expect(retrieved).toBeUndefined();
  });
});
