import type { FileTreeProvider } from './file-node';

export type EditorLanguage = 
  | 'javascript' 
  | 'typescript' 
  | 'python' 
  | 'rust' 
  | 'html' 
  | 'css' 
  | 'json' 
  | 'markdown'
  | 'plaintext';

export interface EditorBuffer {
  filePath: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  language: EditorLanguage;
  isReadOnly: boolean;
  isConnectionLost?: boolean;
  provider: FileTreeProvider;
  connectionId?: string;
}

export interface EditorState {
  activeBuffer: EditorBuffer | null;
  recentFiles: string[];
}
