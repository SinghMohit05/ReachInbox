export interface Sender {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  enabled: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  senders?: Sender[];
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
