import { createStore, produce } from "solid-js/store";
import type { SessionInfo, SessionId } from "../types/session";

interface SessionState {
  sessions: Record<string, SessionInfo>;
}

const [state, setState] = createStore<SessionState>({
  sessions: {},
});

export const sessionStore = {
  get sessions() {
    return state.sessions;
  },

  reset() {
    setState({
      sessions: {},
    });
  },

  registerSession(info: SessionInfo) {
    setState("sessions", info.id.value, info);
  },

  removeSession(id: SessionId) {
    setState(
      "sessions",
      produce((sessions) => {
        delete sessions[id.value];
      })
    );
  },

  getSession(id: SessionId): SessionInfo | undefined {
    return state.sessions[id.value];
  },
};
