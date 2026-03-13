import { invokeMock } from "./tauri-backend";

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invokeMock<T>(command, args);
}
