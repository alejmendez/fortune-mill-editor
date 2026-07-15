// Trace test: print every field's start position and value while parsing the real save.

const fs = require('fs');
const path = require('path');

const SAV = path.join(process.env.APPDATA, 'Godot', 'app_userdata', 'Fortune Mill', 'save_game.sav');
const root = __dirname;
const globalAny = globalThis;
globalAny.window = globalAny;
const code = fs.readFileSync(path.join(root, 'format.js'), 'utf8') + '\n' +
             fs.readFileSync(path.join(root, 'codec.js'), 'utf8');
(0, eval)(code);

const { Schema, Codec } = globalAny.FortuneMill;

if (!fs.existsSync(SAV)) {
  console.error('Save not found at', SAV);
  process.exit(1);
}

const bytes = fs.readFileSync(SAV);

// Custom reader that prints every read
class TraceReader {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
    this.pos = 0;
  }
  _need(n) {
    if (this.pos + n > this.bytes.length) throw new RangeError(`OOB at 0x${this.pos.toString(16)}, need ${n} bytes`);
  }
  _readBytes(n) { this._need(n); const s = this.pos; this.pos += n; return { bytes: this.bytes.slice(s, s+n), start: s }; }
  u32() { const { bytes, start } = this._readBytes(4); return { v: new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true), pos: start, len: 4 }; }
  u64() { const { bytes, start } = this._readBytes(8); return { v: new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true), pos: start, len: 8 }; }
  f64() { const { bytes, start } = this._readBytes(8); return { v: new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(0, true), pos: start, len: 8 }; }
  u8()  { const { bytes, start } = this._readBytes(1); return { v: bytes[0], pos: start, len: 1 }; }
  bigint() { const l = this.u32(); const { bytes, start } = this._readBytes(l.v); return { v: Codec.bigintFromBytes(bytes), pos: start - 4, len: 4 + l.v }; }
}

const r = new TraceReader(bytes.buffer);
for (const def of Schema) {
  const count = def.count || 1;
  const vals = [];
  let firstPos = -1;
  for (let i = 0; i < count; i++) {
    let res;
    switch (def.type) {
      case 'u32':    res = r.u32(); vals.push(res.v); break;
      case 'i32':    { const u = r.u32(); vals.push(u.v - 65536); res = { pos: u.pos, len: 4 }; break; }
      case 'i64':    { const u = r.u64(); vals.push(u.v - 65536n); res = { pos: u.pos, len: 8 }; break; }
      case 'f64':    res = r.f64(); vals.push(res.v); break;
      case 'bool':   res = r.u8(); vals.push(res.v !== 0); break;
      case 'bigint': { res = r.bigint(); vals.push(res.v); break; }
    }
    if (i === 0) firstPos = res.pos;
  }
  const summary = count === 1 ? `= ${vals[0]}` : `[${vals.slice(0,3).join(', ')}${count>3?', ...':''}] (n=${count})`;
  console.log(`0x${firstPos.toString(16).padStart(4,'0')}  ${def.name.padEnd(30)} ${def.type.padEnd(8)} ${summary}`);
}
console.log(`\nFinal pos: 0x${r.pos.toString(16)} (${r.pos} bytes), file size: ${bytes.length}`);
