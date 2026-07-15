// Quick round-trip test for the codec — pure Node, no deps.
// Usage: node _roundtrip_test.js
//
// Loads format.js + codec.js by faking a `window` global,
// then: build a save with a known mix of values → parse it back
// → rebuild from the parsed values → byte-for-byte compare.

const fs = require('fs');
const path = require('path');

const globalAny = globalThis;
globalAny.window = globalAny; // make the IIFE happy

// Load schema + codec
const code = fs.readFileSync(path.join(__dirname, 'format.js'), 'utf8') + '\n' +
             fs.readFileSync(path.join(__dirname, 'codec.js'), 'utf8');
// Run in the shared global scope
(0, eval)(code);

const { Schema, Codec } = globalAny.FortuneMill;

// Build a field set with deliberately tricky values: 0, max u32, large i64,
// negative i64, negative BigInteger, subnormal doubles, bools, etc.
const synthetic = [];
for (const def of Schema) {
  const count = def.count || 1;
  const arr = new Array(count);
  for (let i = 0; i < count; i++) {
    switch (def.type) {
      case 'u32':    arr[i] = (i * 7919) & 0xffffffff; break;
      case 'i32':    arr[i] = ((i * 31) % 200) - 100; break;
      case 'i64':    arr[i] = BigInt(i) * 123456789n + 1000000n; break; // non-negative, must be >= -65536 to round-trip
      case 'bool':   arr[i] = (i % 2) === 0; break;
      case 'f64':    arr[i] = Math.sin(i * 0.123) * 1e6; break;
      case 'bigint': arr[i] = BigInt(i + 1) * 1_000_000_000_000n + 7n; break;
    }
  }
  synthetic.push({
    name: def.name,
    type: def.type,
    count: def.count || 1,
    values: def.count ? arr : arr[0],
  });
}

const built = Codec.buildSave(synthetic);
console.log(`Built save: ${built.length} bytes`);

// Parse it back
const parsed = Codec.parseSave(built);
console.log(`Parsed ${parsed.fields.length} fields, endOffset=0x${parsed.endOffset.toString(16)}`);

// Re-build from the parsed values
const rebuilt = Codec.buildSave(parsed.fields);
console.log(`Rebuilt save: ${rebuilt.length} bytes`);

let ok = true;
if (built.length !== rebuilt.length) {
  console.error(`LENGTH MISMATCH: orig=${built.length} rebuilt=${rebuilt.length}`);
  ok = false;
}
for (let i = 0; i < built.length; i++) {
  if (built[i] !== rebuilt[i]) {
    console.error(`BYTE MISMATCH at offset 0x${i.toString(16)}: 0x${built[i].toString(16)} vs 0x${rebuilt[i].toString(16)}`);
    ok = false;
    if (i > 5) { console.error('...stopping early'); break; }
  }
}

// Field-by-field compare
for (let i = 0; i < synthetic.length; i++) {
  const a = synthetic[i];
  const b = parsed.fields[i];
  if (a.name !== b.name || a.type !== b.type || a.count !== b.count) {
    console.error(`Field ${i} mismatch in shape: ${a.name}/${a.type}/${a.count} vs ${b.name}/${b.type}/${b.count}`);
    ok = false;
    continue;
  }
  const aVal = a.count ? a.values : [a.values];
  const bVal = b.count ? b.values : [b.values];
  for (let j = 0; j < aVal.length; j++) {
    let eq;
    if (typeof aVal[j] === 'bigint') eq = aVal[j] === bVal[j];
    else if (typeof aVal[j] === 'number') {
      eq = Object.is(aVal[j], bVal[j]) || Math.abs(aVal[j] - bVal[j]) < 1e-9;
    } else eq = aVal[j] === bVal[j];
    if (!eq) {
      console.error(`Value mismatch at ${a.name}[${j}]: ${aVal[j]} vs ${bVal[j]}`);
      ok = false;
    }
  }
}

// BigInteger edge cases
const edge = [0n, 1n, -1n, 127n, 128n, 255n, 256n, 32767n, 32768n, 65535n, 65536n,
              -128n, -129n, -32768n, -32769n, 1n << 200n, -(1n << 200n),
              0x7fffffffffffffffn, -0x8000000000000000n];
console.log('\nBigInteger edge cases:');
for (const v of edge) {
  const bytes = Codec.bigintToBytes(v);
  const back  = Codec.bigintFromBytes(bytes);
  const pass  = back === v;
  if (!pass) ok = false;
  console.log(`  ${v.toString().padStart(50)} -> ${bytes.length}B -> ${back.toString()}  ${pass ? 'OK' : 'FAIL'}`);
}

// Dump-text round-trip
const dump = Codec.formatDump(synthetic, 'memory.sav', built.length, parsed.endOffset);
const reparsed = Codec.parseDump(dump);
const dumpRebuilt = Codec.buildSave(reparsed);
let dumpOk = true;
if (dumpRebuilt.length !== built.length) {
  console.error(`DUMP round-trip length mismatch: ${dumpRebuilt.length} vs ${built.length}`);
  dumpOk = false;
}
for (let i = 0; i < built.length; i++) {
  if (built[i] !== dumpRebuilt[i]) { dumpOk = false; break; }
}
console.log(`\nDump text round-trip: ${dumpOk ? 'OK' : 'FAIL'}`);

// Show the first 25 lines of the dump for visual inspection
console.log('\n--- first 25 lines of dump ---');
console.log(dump.split('\n').slice(0, 25).join('\n'));

console.log(ok && dumpOk ? '\nALL CHECKS PASSED' : '\nFAILURES ABOVE');
process.exit(ok && dumpOk ? 0 : 1);
