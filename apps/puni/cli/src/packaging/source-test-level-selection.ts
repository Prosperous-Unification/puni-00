import {parseSecretsOrThrow,type} from '@shared/validation';

const Selection=type({
  format:"'puni-source-test-level-selection'",version:'1',
  record:'string>0',recordSha256:/^[0-9a-f]{64}$/u,
  installationDirectory:'string>0',executable:'string>0',sourceRoot:'string>0',
}).onUndeclaredKey('reject');
export interface SourceTestLevelSelection{
  readonly record:Uint8Array;
  readonly recordSha256:string;
  readonly installationDirectory:string;
  readonly executable:string;
  readonly sourceRoot:string;
}
function decodeBase64(encoded:string):Buffer{
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64')!==encoded)throw new Error('source test-level selection must use exact base64');
  return bytes;
}
/**
 * Preserve canonical selection-record bytes and arbitrary native path characters through Nx's
 * dotenv transport. The envelope grants no source or installation authority: the actual main
 * separately verifies the archive, exact delivered entrypoint and complete captured source.
 */
export function createSourceTestLevelSelection(selection:SourceTestLevelSelection):string{
  const encoded=JSON.stringify({format:'puni-source-test-level-selection',version:1,
    record:Buffer.from(selection.record).toString('base64'),recordSha256:selection.recordSha256,
    installationDirectory:selection.installationDirectory,executable:selection.executable,sourceRoot:selection.sourceRoot});
  const transport=Buffer.from(encoded).toString('base64');
  readSourceTestLevelSelection(transport);
  return transport;
}
/** Decode exactly one required source-role transport before any provider or filesystem admission. */
export function readSourceTestLevelSelection(encoded:string):SourceTestLevelSelection{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(decodeBase64(encoded));
  const selected=parseSecretsOrThrow(Selection,JSON.parse(text));
  return{record:decodeBase64(selected.record),recordSha256:selected.recordSha256,
    installationDirectory:selected.installationDirectory,executable:selected.executable,sourceRoot:selected.sourceRoot};
}
