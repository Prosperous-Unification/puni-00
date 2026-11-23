import { prepareWorkPackageBirth } from '../module/work-package/work-package-birth';
import type { Clock } from '../ports/clock';
import type { ProjectAdministration, ProjectCaller } from '../ports/project-administration';
import type { ProjectRead } from '../ports/project-read';
import type { ProjectSettingsPurpose } from './project-settings';

export interface ProjectResourceOptions {
  readonly administration: ProjectAdministration;
  readonly read: ProjectRead;
  readonly clock: Clock;
  readonly settings: Pick<ProjectSettingsPurpose, 'read' | 'writeBudget'>;
}

/**
 * Mints one retained project act and delegates current authority/settlement to required ports.
 * Optional first birth uses seven distinct identities and the same captured instant; empty uses four.
 * No actor or organization is supplied independently of the complete authenticated caller.
 * E41 policy and readable-child projection belong to the admitted adapter, not this resource.
 */
export class ProjectResource {
  constructor(private readonly options: ProjectResourceOptions) {}

  async readSettings(caller: ProjectCaller, projectId: string) {
    return await this.options.settings.read(caller, projectId);
  }

  async writeSettings(caller: ProjectCaller, projectId: string, budgetFactor: number | null) {
    return await this.options.settings.writeBudget(caller, projectId, budgetFactor);
  }

  async create(caller: ProjectCaller, name: string, workPackage?: { readonly name: string }) {
    caller = structuredClone(caller);
    const at = this.options.clock.now();
    const draft = { id: this.options.clock.newId(), name };
    const act = {
      at,
      grantId: this.options.clock.newId(),
      projectAuditId: this.options.clock.newId(),
      grantAuditId: this.options.clock.newId(),
    };
    const first =
      workPackage === undefined
        ? undefined
        : {
            ...prepareWorkPackageBirth(
              workPackage.name,
              draft.id,
              { at, by: caller.principal.id },
              () => this.options.clock.newId(),
            ),
            creatorGrant: { id: this.options.clock.newId(), auditId: this.options.clock.newId() },
          };
    const created = await this.options.administration.create(caller, draft, act, first);
    // Built-in creator-grant refusal is trusted-state failure after rollback, not a public name conflict.
    if (typeof created === 'string' && created !== 'name_taken')
      throw new Error('project creator grant refused: ' + created, { cause: created });
    return created;
  }

  async rename(caller: ProjectCaller, projectId: string, name: string) {
    caller = structuredClone(caller);
    const act = { at: this.options.clock.now(), auditId: this.options.clock.newId() };
    return await this.options.administration.rename(caller, projectId, name, act);
  }

  async delete(caller: ProjectCaller, projectId: string) {
    caller = structuredClone(caller);
    const act = { at: this.options.clock.now(), auditId: this.options.clock.newId() };
    return await this.options.administration.delete(caller, projectId, act);
  }

  /** Captures the complete caller and one audit act; current authority and atomic move belong to the port. */
  async moveWorkPackage(caller: ProjectCaller, workPackageId: string, targetProjectId: string) {
    caller = structuredClone(caller);
    const act = { at: this.options.clock.now(), auditId: this.options.clock.newId() };
    return await this.options.administration.moveWorkPackage(
      caller,
      workPackageId,
      targetProjectId,
      act,
    );
  }

  async list(caller: ProjectCaller) {
    return await this.options.read.list(structuredClone(caller));
  }

  async read(caller: ProjectCaller, projectId: string) {
    return await this.options.read.read(structuredClone(caller), projectId);
  }
}
