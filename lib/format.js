// Display helpers for the messaging UI.

/** Relative time under 24h ("just now", "5m ago", "3h ago"); absolute beyond. */
export function timeAgo(input) {
  if (!input) return '';
  const d = new Date(input);
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Exact clock time for a bubble ("3:14 PM"). */
export function clockTime(input) {
  if (!input) return '';
  return new Date(input).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "inbound text" / "outbound call" label from an activity row. */
export function channelLabel(activity) {
  if (!activity) return '';
  const ch = activity.activity_type === 'CALL' ? 'call' : 'text';
  const dir = (activity.direction || '').toLowerCase();
  return dir ? `${dir} ${ch}` : ch;
}
