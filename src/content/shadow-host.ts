/**
 * shadow-host.ts — mount extension UI on X inside a closed shadow root.
 * The FAB and snackbar show usernames, file names and progress; in a closed
 * shadow root page scripts cannot query or read that DOM, and X's CSS cannot
 * restyle it. Returns null when the host already exists (script loaded twice).
 */
export function createClosedShadowRoot(hostId: string): ShadowRoot | null {
  if (document.getElementById(hostId)) return null;
  const host = document.createElement('div');
  host.id = hostId;
  const root = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);
  return root;
}
