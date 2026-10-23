/**
 * The only SSH capability Twilight Dash's compute providers may reach: the pinned transport
 * record and the remote-command renderer. `@tools/fleet-ssh-transport` resolves here, so the
 * discovery renderers and the fleet commands stay out of Dash's module surface.
 */
export {
  readSshTransport,
  renderRemoteCommandArguments,
  type SshTransport,
  SshTransportRefusal,
  type SshTransportRefusalReason,
} from './ssh-transport';
