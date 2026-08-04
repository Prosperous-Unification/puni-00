export interface Example {
  id: string;
  label: string;
  createdAt: number;
}

export interface ExampleRepo {
  create(ex: Example): Promise<void>;
  findById(id: string): Promise<Example | null>;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
}

export interface UserStore {
  /** Returns null when the username is already taken. */
  create(user: User): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}
