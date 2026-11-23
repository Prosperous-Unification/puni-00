import { Button, CONTROL_HEIGHT } from '@ui/saas-01';
import { type ClientReply, readProject } from '@wbs/contracts';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';
import type { AccessLoss } from '@/components/organization/organization-access';
import { OrganizationAccessLoss } from '@/components/organization/organization-access-loss';
import { ScopedSteps } from '@/components/organization/scoped-steps';
import { resolveStepWriteRefusal } from '@/components/organization/step-catalogue-access';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient, useResourceScope } from '@/runtime/organization-resources';

import { ProjectResolvedSteps } from './project-resolved-steps';

const SHAPES = [readProject] as const;
type Project = Extract<ClientReply<typeof readProject>, { kind: 'success' }>['body']['project'];
type View =
  { kind: 'loading' } | { kind: 'failure'; message: string } | { kind: 'ready'; project: Project };
interface Props {
  projectId: string;
  nav: ReactNode;
  account: ReactNode;
}

/** Route ids address an actual admitted read; neither a picker shell nor a package supplies project authority. */
export function ProjectSettingsPage(props: Props): React.JSX.Element {
  const { organization } = useResourceScope();
  // Proof: inverting admission lost the explicit inactive state in scoped-step-settings.test.tsx.
  return organization.kind === 'active' ? (
    <ProjectSettingsReader {...props} organizationId={organization.organizationId} />
  ) : (
    <>
      <AppHeader nav={props.nav} account={props.account} />
      <main className="p-6">
        <p>Choose an organization to view project settings.</p>
      </main>
    </>
  );
}

function ProjectSettingsReader({
  projectId,
  organizationId,
  nav,
  account,
}: Props & { organizationId: string }): React.JSX.Element {
  const client = useResourceClient(SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' }),
    [readVersion, setReadVersion] = useState(0),
    [stepsVersion, setStepsVersion] = useState(0),
    [loss, setLoss] = useState<AccessLoss | null>(null),
    [fault, setFault] = useState<Error | null>(null);
  const changed = useCallback(() => {
    setStepsVersion((version) => version + 1);
  }, []);
  const unavailable = useCallback((message: string) => {
    setView({ kind: 'failure', message });
  }, []);
  useEffect(() => {
    let isCurrent = true;
    setView({ kind: 'loading' });
    async function readProjectOwner() {
      const reply = await client.getApiProjectsById({ params: { id: projectId } });
      // Proof: omitting this fence let the held older project replace Newer project in scoped-step-settings.test.tsx.
      if (!isCurrent) return;
      switch (reply.kind) {
        case 'success':
          // Proof: omitting this guard failed the precise another-project fault case in scoped-step-settings.test.tsx.
          if (reply.body.project.id !== projectId)
            throw new Error('Project settings read returned another project');
          // Proof: omitting this guard failed the precise another-organization fault case in scoped-step-settings.test.tsx.
          if (reply.body.project.organizationId !== organizationId)
            throw new Error('Project settings read returned another organization');
          setView({ kind: 'ready', project: reply.body.project });
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled')
            setView({ kind: 'failure', message: failureMessage(reply.failure) });
          return;
        case 'refusal': {
          if (reply.body.error === 'forbidden') {
            setView({
              kind: 'failure',
              message: 'You do not have permission to view this project.',
            });
            return;
          }
          if (reply.body.error === 'not_found') {
            setView({ kind: 'failure', message: 'This project is no longer available.' });
            return;
          }
          const outcome = resolveStepWriteRefusal(reply.body);
          if (outcome.kind === 'lost') setLoss(outcome.loss);
          else setView({ kind: 'failure', message: outcome.text });
          return;
        }
        default:
          return unreachable(reply);
      }
    }
    void readProjectOwner().catch((cause: unknown) => {
      if (isCurrent) setFault(new Error('Unexpected project settings read failure', { cause }));
    });
    return () => {
      isCurrent = false;
    };
  }, [client, projectId, organizationId, readVersion]);
  if (fault !== null) throw fault;
  return (
    <>
      <AppHeader nav={nav} account={account} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
        {loss !== null ? (
          <OrganizationAccessLoss loss={loss} />
        ) : (
          <>
            <p className="text-muted-foreground text-sm">Project settings</p>
            <h1 className="m-0 text-2xl font-semibold">
              {view.kind === 'ready' ? view.project.name : 'Project settings'}
            </h1>
            <Button
              type="button"
              variant="outline"
              className={`self-start ${CONTROL_HEIGHT}`}
              onClick={() => {
                setReadVersion((version) => version + 1);
              }}
            >
              Refresh project
            </Button>
            {view.kind === 'loading' && <p>Loading project…</p>}
            {view.kind === 'failure' && (
              <p role="alert" className="text-destructive text-sm">
                {view.message}
              </p>
            )}
            {view.kind === 'ready' && (
              <>
                <ScopedSteps
                  scope={{
                    scopeKind: 'project',
                    scopeId: view.project.id,
                    name: view.project.name,
                  }}
                  onChanged={changed}
                  onAccessLost={setLoss}
                />
                <ProjectResolvedSteps
                  projectId={view.project.id}
                  version={stepsVersion}
                  onAccessLost={setLoss}
                  onUnavailable={unavailable}
                />
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
