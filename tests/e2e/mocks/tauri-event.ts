import { listenMock } from "./tauri-backend";

export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void> {
  return listenMock(event as "session-output" | "session-exit", handler as (event: { payload: unknown }) => void);
}
