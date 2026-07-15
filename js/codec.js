/**
 * Fortune Mill save format — binary codec.
 *
 * Reads and writes the exact same byte layout as
 * fortune_mill_dumper.py / fortune_mill_dump_to_sav.py:
 *
 *   - u32 / u64 little-endian via DataView
 *   - int32 / int64 stored as u32 / u64 with +65536 offset
 *   - bool: 1 byte (0 = false, anything else = true)
 *   - f64:  IEEE 754 double, little-endian
 *   - BigInteger (int, .NET-style): 4 bytes length (u32 LE) + N bytes payload
 *           interpreted as little-endian two's complement.
 */
(function (global) {
  'use strict';

  const INT_OFFSET = 65536n;
  const U32_OFFSET = 0x10000; // 65536 as Number for u32 range checks

  // ---------- BigInteger (.NET byte[]) ----------

  /**
   * Convert a JS BigInt to a little-endian two's-complement byte array
   * compatible with `new System.Numerics.BigInteger(byte[])` from .NET.
   *
   * Rules:
   *   - 0      -> [0x00]
   *   - > 0    -> minimal little-endian bytes; if the top bit of the
   *               last byte would be set, append 0x00 to mark it positive.
   *   - < 0    -> minimal two's-complement little-endian bytes (sign bit set).
   */
  function bigintToBytes(v) {
    if (typeof v !== 'bigint') {
      throw new TypeError('bigintToBytes expects a BigInt');
    }
    if (v === 0n) return new Uint8Array([0]);

    // Determine minimal signed byte length.
    // A signed N-bit integer covers [-2^(N-1), 2^(N-1) - 1].
    // We need:  -2^(8n-1) <= v < 2^(8n-1)
    let n; // number of bytes
    if (v > 0n) {
      // bit length of |v| + 1 sign bit, rounded up to a byte boundary
      const bitLen = v.toString(2).length;
      n = Math.ceil((bitLen + 1) / 8);
    } else {
      // For negative v we need at least one more bit than |v|
      const absV = -v;
      const bitLen = absV.toString(2).length;
      n = Math.ceil((bitLen + 1) / 8);
    }

    // Try to shrink: remove full bytes from the top if the value still fits.
    while (n > 1) {
      const lo = -(1n << BigInt(8 * (n - 1)));    // 2^(8(n-1)-1) negated? no, lowest signed = -2^(8(n-1)-1)
      // lowest representable in signed 8(n-1)-bit:  -(2^(8(n-1)-1))
      const low  = -(1n << BigInt(8 * (n - 1) - 1));
      const high =   1n << BigInt(8 * (n - 1) - 1);
      if (v >= low && v < high) {
        n -= 1;
      } else {
        break;
      }
    }

    const bytes = new Uint8Array(n);
    let t = v;
    for (let i = 0; i < n; i++) {
      bytes[i] = Number(t & 0xffn);
      // BigInt >> is arithmetic (sign-extending) on negative values, which is
      // exactly what we need for two's complement.
      t >>= 8n;
    }
    return bytes;
  }

  /**
   * Convert a little-endian two's-complement byte array to a JS BigInt.
   * Empty array is treated as 0 (matches Python's `if n else 0` branch).
   */
  function bigintFromBytes(bytes) {
    if (!(bytes instanceof Uint8Array) && !(bytes instanceof Array)) {
      throw new TypeError('bigintFromBytes expects a Uint8Array');
    }
    if (bytes.length === 0) return 0n;

    let result = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) {
      result = (result << 8n) | BigInt(bytes[i]);
    }
    // If the sign bit is set, sign-extend.
    if (bytes[bytes.length - 1] & 0x80) {
      const signBit = BigInt(bytes.length) * 8n;
      result = result - (1n << signBit);
    }
    return result;
  }

  // ---------- Binary reader ----------

  class BinaryReader {
    constructor(buffer, littleEndian = true) {
      this.view = new DataView(buffer);
      this.bytes = new Uint8Array(buffer);
      this.pos = 0;
      this.le = littleEndian;
    }

    tell() { return this.pos; }
    remaining() { return this.bytes.length - this.pos; }

    _need(n) {
      if (this.pos + n > this.bytes.length) {
        throw new RangeError(`Reader out of bounds: pos=0x${this.pos.toString(16)}, need ${n} bytes, have ${this.remaining()}`);
      }
    }

    u8()  { this._need(1); const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
    u32() { this._need(4); const v = this.view.getUint32(this.pos, this.le); this.pos += 4; return v; }
    u64() { this._need(8); const v = this.view.getBigUint64(this.pos, this.le); this.pos += 8; return v; }
    f64() { this._need(8); const v = this.view.getFloat64(this.pos, this.le); this.pos += 8; return v; }

    /** int32 stored as u32 + 65536 */
    i32() { return Number(this.u32() - U32_OFFSET); }

    /** int64 stored as u64 + 65536 — returns BigInt (since Number can't hold full u64) */
    i64() { return this.u64() - INT_OFFSET; }

    /** bool: 0 = false, anything else = true */
    bool() { return this.u8() !== 0; }

    /** .NET BigInteger: u32 length + payload */
    bigint() {
      const n = this.u32();
      this._need(n);
      const payload = this.bytes.slice(this.pos, this.pos + n);
      this.pos += n;
      return bigintFromBytes(payload);
    }
  }

  // ---------- Binary writer ----------

  class BinaryWriter {
    constructor(littleEndian = true) {
      this.le = littleEndian;
      this.chunks = [];
      this.size = 0;
    }

    _append(bytes) {
      this.chunks.push(bytes);
      this.size += bytes.length;
    }

    u8(v) {
      const b = new Uint8Array(1);
      b[0] = v & 0xff;
      this._append(b);
    }

    u32(v) {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setUint32(0, Number(v) >>> 0, this.le);
      this._append(new Uint8Array(buf));
    }

    u64(v) {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setBigUint64(0, BigInt.asUintN(64, BigInt(v)), this.le);
      this._append(new Uint8Array(buf));
    }

    f64(v) {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, Number(v), this.le);
      this._append(new Uint8Array(buf));
    }

    /** int32 stored as u32 + 65536 */
    i32(v) {
      const stored = (Number(v) + U32_OFFSET) >>> 0;
      this.u32(stored);
    }

    /** int64 stored as u64 + 65536. Accepts Number or BigInt. */
    i64(v) {
      const stored = BigInt(v) + INT_OFFSET;
      this.u64(stored);
    }

    bool(v) {
      this.u8(v ? 1 : 0);
    }

    bigint(v) {
      if (typeof v !== 'bigint') {
        v = BigInt(v);
      }
      const payload = bigintToBytes(v);
      this.u32(payload.length);
      this._append(payload);
    }

    /** Combine all chunks into one Uint8Array. */
    toBytes() {
      const out = new Uint8Array(this.size);
      let off = 0;
      for (const c of this.chunks) {
        out.set(c, off);
        off += c.length;
      }
      return out;
    }
  }

  // ---------- High-level field codec (uses SCHEMA) ----------

  /**
   * Parse a .sav file into an array of { name, type, count?, values }.
   * `values` is a flat array of length `count` for arrays, or a single value
   * for scalars. Scalar value types: number for i32, bigint for i64/bigint,
   * boolean for bool, number for f64, number for u32.
   */
  function parseSave(bytes) {
    const r = new BinaryReader(bytes.buffer ? bytes.buffer : bytes, true);
    const fields = [];
    for (const def of global.FortuneMill.Schema) {
      const count = def.count || 1;
      const values = new Array(count);
      for (let i = 0; i < count; i++) {
        switch (def.type) {
          case 'u32':    values[i] = r.u32(); break;
          case 'i32':    values[i] = r.i32(); break;
          case 'i64':    values[i] = r.i64(); break;
          case 'bool':   values[i] = r.bool(); break;
          case 'f64':    values[i] = r.f64(); break;
          case 'bigint': values[i] = r.bigint(); break;
          default: throw new Error(`Unknown type: ${def.type}`);
        }
      }
      fields.push({
        name: def.name,
        type: def.type,
        count: def.count || 1,
        values: def.count ? values : values[0],
      });
    }
    return { fields, endOffset: r.tell(), totalBytes: r.bytes.length };
  }

  /**
   * Serialize a list of fields (as produced by parseSave or edited by the UI)
   * back into a .sav file. The order of `fields` does not matter — they are
   * emitted in SCHEMA order, and any field missing from the input is filled
   * with a zero default that matches its type.
   */
  function buildSave(fields) {
    const byName = new Map();
    for (const f of fields) byName.set(f.name, f);

    const w = new BinaryWriter(true);
    for (const def of global.FortuneMill.Schema) {
      const f = byName.get(def.name);
      const count = def.count || 1;
      const values = f ? f.values : null;
      switch (def.type) {
        case 'u32': {
          const v = values == null ? 0 : Number(values);
          w.u32(v);
          break;
        }
        case 'i32': {
          if (values == null) w.i32(0);
          else if (def.count) for (let i = 0; i < count; i++) w.i32(Number(values[i] ?? 0));
          else w.i32(Number(values));
          break;
        }
        case 'i64': {
          if (values == null) w.i64(0n);
          else if (def.count) for (let i = 0; i < count; i++) w.i64(BigInt(values[i] ?? 0n));
          else w.i64(BigInt(values));
          break;
        }
        case 'bool': {
          if (values == null) w.bool(false);
          else if (def.count) for (let i = 0; i < count; i++) w.bool(Boolean(values[i]));
          else w.bool(Boolean(values));
          break;
        }
        case 'f64': {
          if (values == null) w.f64(0);
          else if (def.count) for (let i = 0; i < count; i++) w.f64(Number(values[i] ?? 0));
          else w.f64(Number(values));
          break;
        }
        case 'bigint': {
          if (values == null) w.bigint(0n);
          else if (def.count) for (let i = 0; i < count; i++) w.bigint(BigInt(values[i] ?? 0n));
          else w.bigint(BigInt(values));
          break;
        }
        default:
          throw new Error(`Unknown type: ${def.type}`);
      }
    }
    return w.toBytes();
  }

  // ---------- Dump text format (matches Python dumper) ----------

  /** Bytes occupied by a single value of the given type. */
  function sizeOf(type, value) {
    switch (type) {
      case 'u32': case 'i32': return 4;
      case 'i64': case 'f64': return 8;
      case 'bool': return 1;
      case 'bigint': {
        const v = typeof value === 'bigint' ? value : BigInt(value ?? 0);
        return 4 + bigintToBytes(v).length;
      }
    }
    return 0;
  }

  /**
   * Render fields in the same textual format the Python dumper produces:
   *   "  0x0000  name            type      = value"
   * Scalars: one line per field. Arrays: one line per element with `[i]`.
   *
   * Padding follows the Python source:
   *   - IMPORTANT VALUES section pads the name to 18 characters.
   *   - ALL ENTRIES section pads the name to 32 characters.
   */
  function formatDump(fields, filePath, fileSize, endOffset) {
    // Compute each field's start offset by simulating a writer pass.
    let pos = 0;
    const fieldOffsets = new Map();
    const elementOffsets = []; // [fieldIndex][i] = start offset of element i
    for (const f of fields) {
      fieldOffsets.set(f, pos);
      if (f.count > 1) {
        const arr = new Array(f.count);
        for (let i = 0; i < f.count; i++) {
          arr[i] = pos;
          pos += sizeOf(f.type, f.values[i]);
        }
        elementOffsets.push(arr);
      } else {
        elementOffsets.push([pos]);
        pos += sizeOf(f.type, f.values);
      }
    }
    const computedEnd = endOffset || pos;

    const lines = [];
    lines.push(`Save: ${filePath || '<memory>'}`);
    lines.push(`File size: ${fileSize} bytes, parsed until 0x${computedEnd.toString(16).toUpperCase()}`);
    lines.push('');
    lines.push('IMPORTANT VALUES');
    const important = new Set([
      'version', 'unlockedWorlds', 'startedGame', 'completedGame',
      'sushiSaved', 'isLethalMode', 'NGPlus',
      'zenithGemRank', 'zenithGemCount', 'zenithCooldown',
    ]);
    for (let fi = 0; fi < fields.length; fi++) {
      const f = fields[fi];
      if (!important.has(f.name)) continue;
      if (f.count > 1) continue;
      lines.push(formatFieldLine(f, 0, elementOffsets[fi][0], 18));
    }
    lines.push('');
    lines.push('ALL ENTRIES');
    for (let fi = 0; fi < fields.length; fi++) {
      const f = fields[fi];
      if (f.count > 1) {
        for (let i = 0; i < f.count; i++) {
          lines.push(formatFieldLine(f, i, elementOffsets[fi][i], 32));
        }
      } else {
        lines.push(formatFieldLine(f, 0, elementOffsets[fi][0], 32));
      }
    }
    return lines.join('\n') + '\n';
  }

  /** Maps internal short type names to the names produced by the Python dumper. */
  const DUMP_TYPE_NAME = {
    u32:    'uint32',
    i32:    'int',
    i64:    'long',
    f64:    'double',
    bigint: 'BigInteger',
    bool:   'bool',
  };

  function formatFieldLine(f, i, offset, namePad = 32) {
    const name = f.count > 1 ? `${f.name}[${i}]` : f.name;
    const v = f.count > 1 ? f.values[i] : f.values;
    const typeName = DUMP_TYPE_NAME[f.type] || f.type;
    const off = `0x${(offset >>> 0).toString(16).toUpperCase().padStart(4, '0')}`;
    return `  ${off}  ${name.padEnd(namePad)} ${typeName.padEnd(10)} = ${formatValue(v, f.type)}`;
  }

  function formatValue(v, type) {
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return String(v);
      if (type === 'f64') {
        // Python prints doubles with a decimal point ("0.0", "1.61").
        const s = v.toString();
        return s.includes('.') || s.includes('e') ? s : s + '.0';
      }
      return String(v);
    }
    return String(v);
  }

  // ---------- Dump text parser (matches dump_to_sav.py) ----------

  const LINE_RE = /^\s*(?:0x[0-9A-Fa-f]+\s+)?(?<name>\S+)\s+(?<typ>\S+)\s+=\s+(?<value>.*)$/;

  function parseValue(typ, text) {
    text = text.trim();
    if (typ === 'bool') return /^(true|1|yes)$/i.test(text);
    // Accept both Python-dumper names and our internal short names.
    if (typ === 'int' || typ === 'i32' ||
        typ === 'long' || typ === 'i64' ||
        typ === 'BigInteger' || typ === 'bigint' ||
        typ === 'uint32' || typ === 'u32') {
      return BigInt(text.replace(/[,\s]/g, ''));
    }
    if (typ === 'double' || typ === 'f64') return parseFloat(text);
    throw new Error(`Unknown type: ${typ}`);
  }

  /**
   * Parse a dump text back into fields, used by the "Import dump → .sav" path.
   * Accepts both `int`/`long`/`BigInteger`/`uint32` (Python style) and our
   * internal `i32`/`i64`/`bigint`/`u32` types.
   */
  function parseDump(text) {
    const collected = new Map(); // name -> { type, values: [] }
    for (const line of text.split(/\r?\n/)) {
      const m = LINE_RE.exec(line);
      if (!m) continue;
      let name = m.groups.name;
      let typ  = m.groups.typ;
      // Normalize types
      const typeMap = { int: 'i32', long: 'i64', BigInteger: 'bigint', uint32: 'u32' };
      typ = typeMap[typ] || typ;

      let index = null;
      const arrMatch = /^(.*)\[(\d+)\]$/.exec(name);
      if (arrMatch) {
        name = arrMatch[1];
        index = parseInt(arrMatch[2], 10);
      }

      if (!collected.has(name)) collected.set(name, { type: typ, values: [] });
      const slot = collected.get(name);
      // For scalars, just keep the last value; for arrays, fill by index.
      if (index == null) {
        slot.scalar = parseValue(typ, m.groups.value);
      } else {
        slot.values[index] = parseValue(typ, m.groups.value);
      }
    }

    // Materialize against SCHEMA so the writer can rely on it.
    const fields = [];
    for (const def of global.FortuneMill.Schema) {
      const slot = collected.get(def.name);
      if (!slot) {
        fields.push({ name: def.name, type: def.type, count: def.count || 1, values: def.count ? new Array(def.count).fill(defaultFor(def.type)) : defaultFor(def.type) });
        continue;
      }
      if (def.count) {
        const arr = new Array(def.count);
        for (let i = 0; i < def.count; i++) {
          arr[i] = slot.values[i] != null ? slot.values[i] : defaultFor(def.type);
        }
        fields.push({ name: def.name, type: def.type, count: def.count, values: arr });
      } else {
        const v = slot.scalar != null ? slot.scalar : (slot.values[0] != null ? slot.values[0] : defaultFor(def.type));
        fields.push({ name: def.name, type: def.type, count: 1, values: v });
      }
    }
    return fields;
  }

  function defaultFor(type) {
    switch (type) {
      case 'u32': case 'i32': case 'f64': return 0;
      case 'i64': case 'bigint': return 0n;
      case 'bool': return false;
    }
    return 0;
  }

  // ---------- Exports ----------

  global.FortuneMill = global.FortuneMill || {};
  global.FortuneMill.Codec = {
    BinaryReader,
    BinaryWriter,
    bigintFromBytes,
    bigintToBytes,
    parseSave,
    buildSave,
    formatDump,
    parseDump,
  };
})(typeof window !== 'undefined' ? window : globalThis);
