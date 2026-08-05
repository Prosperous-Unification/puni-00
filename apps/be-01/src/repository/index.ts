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

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  restricted: boolean;
  createdAt: number;
}

export interface Role {
  id: string;
  projectId: string;
  name: string;
}

export interface ProjectPatch {
  name?: string;
  restricted?: boolean;
}

export interface ProjectStore {
  /**
   * Writes the project and its starting roles together. A project that existed
   * for even one request without roles would accept an estimate that had no
   * role to belong to, so the two are one transaction rather than two calls.
   */
  create(project: Project, roles: readonly Role[]): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  /** Every project, newest first. Readable by any account, so it is not filtered by owner. */
  list(): Promise<Project[]>;
  /** Returns null when the project is gone. */
  update(id: string, patch: ProjectPatch): Promise<Project | null>;
  rolesOf(projectId: string): Promise<Role[]>;
}
