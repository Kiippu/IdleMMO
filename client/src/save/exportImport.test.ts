import { describe, it, expect } from 'vitest';
import { exportSave, importSave } from './exportImport';

describe('GW5 save code', () => {
  it('starts with the GW5| prefix', async () => {
    const code = await exportSave('{"a":1}');
    expect(code.startsWith('GW5|')).toBe(true);
  });

  it('round-trips a small JSON string exactly', async () => {
    const json = JSON.stringify({ a: 1, b: [1, 2, 3] });
    expect(await importSave(await exportSave(json))).toBe(json);
  });

  it('round-trips unicode (NPC names with icons are realistic payloads)', async () => {
    const json = JSON.stringify({ merrick: '🪓', branka: '☕', osric: 'æthel' });
    expect(await importSave(await exportSave(json))).toBe(json);
  });

  it('round-trips across byte lengths that hit every base64url padding mode', async () => {
    // b64urlDecode handles pad lengths 0, 2, and 3 based on len % 4. Varying the
    // input size sweeps the gzip output size and exercises all three branches.
    for (let n = 1; n <= 64; n++) {
      const json = JSON.stringify({ x: 'a'.repeat(n) });
      expect(await importSave(await exportSave(json))).toBe(json);
    }
  });

  it('rejects codes without the GW5| prefix', async () => {
    await expect(importSave('not a save')).rejects.toThrow(/Guildwright save code/);
  });
});
