export function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (d: Uint8Array) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < d.length; i++) c = crcTable[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const u32 = (a: Uint8Array, o: number, v: number) => { a[o]=v&255; a[o+1]=(v>>8)&255; a[o+2]=(v>>16)&255; a[o+3]=(v>>24)&255; };
  const u16 = (a: Uint8Array, o: number, v: number) => { a[o]=v&255; a[o+1]=(v>>8)&255; };
  const enc = new TextEncoder();

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc  = crc32(f.data);
    const sz   = f.data.length;

    const local = new Uint8Array(30 + name.length + sz);
    u32(local, 0, 0x04034b50); u16(local, 4, 20); u16(local, 6, 0); u16(local, 8, 0);
    u16(local, 10, 0); u16(local, 12, 0);
    u32(local, 14, crc); u32(local, 18, sz); u32(local, 22, sz);
    u16(local, 26, name.length); u16(local, 28, 0);
    local.set(name, 30); local.set(f.data, 30 + name.length);
    locals.push(local);

    const cen = new Uint8Array(46 + name.length);
    u32(cen, 0, 0x02014b50); u16(cen, 4, 20); u16(cen, 6, 20); u16(cen, 8, 0); u16(cen, 10, 0);
    u16(cen, 12, 0); u16(cen, 14, 0);
    u32(cen, 16, crc); u32(cen, 20, sz); u32(cen, 24, sz);
    u16(cen, 28, name.length); u16(cen, 30, 0); u16(cen, 32, 0); u16(cen, 34, 0);
    u16(cen, 36, 0); u32(cen, 38, 0); u32(cen, 42, offset);
    cen.set(name, 46);
    centrals.push(cen);

    offset += local.length;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  u32(eocd, 0, 0x06054b50); u16(eocd, 4, 0); u16(eocd, 6, 0);
  u16(eocd, 8, files.length); u16(eocd, 10, files.length);
  u32(eocd, 12, cdSize); u32(eocd, 16, offset); u16(eocd, 20, 0);

  const parts = [...locals, ...centrals, eocd];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const zip = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { zip.set(p, pos); pos += p.length; }
  return zip;
}
