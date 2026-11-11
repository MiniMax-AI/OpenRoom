/**
 * Parse the ALLOWED_HOSTS env var into Vite's `server.allowedHosts` value.
 *
 * - Comma-separated list: "example.com, 192.168.1.10" → ['example.com', '192.168.1.10']
 * - "true" → true (allow any host; only use on trusted networks)
 * - Empty / unset → undefined (Vite default: localhost only)
 */
export function parseAllowedHosts(value: string | undefined): string[] | true | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === 'true') return true;
  const hosts = trimmed
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : undefined;
}
