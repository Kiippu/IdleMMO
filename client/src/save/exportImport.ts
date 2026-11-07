// GW5|<base64url(gzip(json))> — the tester share code.
// Pre-launch testers lose their tunnel URL on every wrangler restart, so they
// export this string, paste it into the next build, and keep playing.
const PREFIX = 'GW5|';

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const mod = text.length % 4;
  const pad = mod === 2 ? '==' : mod === 3 ? '=' : '';
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

export async function exportSave(stateJson: string): Promise<string> {
  const bytes = new TextEncoder().encode(stateJson);
  return PREFIX + b64urlEncode(await gzip(bytes));
}

export async function importSave(code: string): Promise<string> {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('Not a Guildwright save code.');
  const bytes = await gunzip(b64urlDecode(trimmed.slice(PREFIX.length)));
  return new TextDecoder().decode(bytes);
}
