export type SshAuthMethod = 'password' | 'key' | 'agent';

export interface SshProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  keyPath?: string;
  group?: string;
  color?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SshConnection {
  connectionId?: string;
  profile: SshProfile;
  status: ConnectionStatus;
  error?: string;
}

export interface SshConnectionStatusPayload {
  connectionId: string;
  profileId: string;
}

export interface SshConnectionLifecycleEvent {
  connectionId: string;
  profileId: string;
  status: "connected" | "disconnected";
  reason?: string;
}
