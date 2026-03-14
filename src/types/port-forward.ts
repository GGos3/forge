export type PortForwardDirection = "local" | "remote";

export interface PortForwardRule {
  id: string;
  profileId: string;
  direction: PortForwardDirection;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  label?: string;
  enabled: boolean;
}

export type TransferDirection = "upload" | "download";
export type TransferStatus = "queued" | "active" | "completed" | "error";

export interface TransferItem {
  id: string;
  connectionId: string;
  localPath: string;
  remotePath: string;
  direction: TransferDirection;
  status: TransferStatus;
  fileName: string;
  bytesTotal: number;
  bytesTransferred: number;
  error?: string;
  startedAt: number;
  completedAt?: number;
}
