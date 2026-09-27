export interface User {
  id: string;
  username: string;
  passwordHash: string | null;
  email?: string | null;
  idpIssuer?: string | null;
  idpSub?: string | null;
  createdAt: number;
}
