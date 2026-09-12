export function genNewId(): string {
  return 'log-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '-' + Math.random().toString(36).slice(2, 6);
}
