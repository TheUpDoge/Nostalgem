// Builds .zip files byte by byte for the tests (stored or deflated files, a data descriptor, wrong sizes
// and checksums on purpose), the way zip tools write them.
import { deflateRawSync, crc32 as zcrc } from "node:zlib";

const enc = new TextEncoder();

// A zip, written the way zip tools write them. files: [{ name, data, method (0 or 8), descriptor }]
export function makeZip(files, opts) {
  const o = opts || {};
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const method = f.method == null ? 8 : f.method;
    const body = method === 8 ? deflateRawSync(data, { level: f.level == null ? 6 : f.level }) : data;
    const crc = f.crc != null ? f.crc : zcrc(data) >>> 0;
    const flags = (f.descriptor ? 8 : 0) | (f.encrypted ? 1 : 0) | 0x800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(f.descriptor ? 0 : crc, 14);
    local.writeUInt32LE(f.descriptor ? 0 : body.length, 18);
    local.writeUInt32LE(f.descriptor ? 0 : data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, Buffer.from(name), Buffer.from(body));
    let size = 30 + name.length + body.length;
    if (f.descriptor) {
      const d = Buffer.alloc(16);
      d.writeUInt32LE(0x08074b50, 0);
      d.writeUInt32LE(crc, 4);
      d.writeUInt32LE(body.length, 8);
      d.writeUInt32LE(data.length, 12);
      parts.push(d);
      size += 16;
    }
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(f.usize != null ? f.usize : data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, Buffer.from(name));
    offset += size;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(o.entries != null ? o.entries : files.length, 8);
  end.writeUInt16LE(o.entries != null ? o.entries : files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(o.cdOffset != null ? o.cdOffset : offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end, Buffer.from(o.comment || "")]));
}

