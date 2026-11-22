/**
 * The visitor's chat messages saved after the request was submitted, oldest first, under the
 * submitted brief in the operator inbox. Nothing renders when there are none.
 */
export function SubmissionFollowUps({ followUps }: { followUps: readonly string[] }) {
  if (followUps.length === 0) return null;
  return (
    <>
      <p className="small">Messages after submission</p>
      <ol className="submission-follow-ups">
        {followUps.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ol>
    </>
  );
}
