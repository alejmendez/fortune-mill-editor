// Smoke test against a more realistic .sav (mimicking typical Fortune Mill values).
// Verifies the JS codec produces dumps that the Python dump_to_sav.py can
// re-import — i.e. cross-tool round-trip via the dump text format.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const globalAny = globalThis;
globalAny.window = globalAny;
const code = fs.readFileSync(path.join(root, 'format.js'), 'utf8') + '\n' +
             fs.readFileSync(path.join(root, 'codec.js'), 'utf8');
(0, eval)(code);

const { Schema, Codec } = globalAny.FortuneMill;

// Build a realistic save: a player who's beaten the game on lethal+NG+3,
// has gacha junk, zenith level-up, etc.
const realistic = [
  { name: 'version',             type: 'u32',    count: 1,    values: 17 },
  { name: 'currencyArray',       type: 'bigint', count: 6,    values: [12345n, 67890n, 0n, 0n, 999n, 1000000000000n] },
  { name: 'secretCurrencyArray', type: 'bigint', count: 6,    values: [10n, 20n, 0n, 0n, 0n, 0n] },
  { name: 'upgradeLevels',       type: 'i64',    count: 232,  values: Array.from({length: 232}, (_, i) => BigInt(i % 50)) },
  { name: 'secretShopLevels',    type: 'i64',    count: 20,   values: Array.from({length: 20}, () => 3n) },
  { name: 'magicRank',           type: 'i64',    count: 1,    values: 12n },
  { name: 'magicXP',             type: 'bigint', count: 1,    values: 999999999n },
  { name: 'magicStats',          type: 'i64',    count: 9,    values: [10n,20n,30n,40n,50n,60n,70n,80n,90n] },
  { name: 'trialMulti',          type: 'f64',    count: 1,    values: 1.75 },
  { name: 'shadowRealmSkeletons',type: 'i64',    count: 1,    values: 4n },
  { name: 'jackpotGot',          type: 'bool',   count: 5,    values: [true,true,false,false,true] },
  { name: 'bestTicketWin',       type: 'bigint', count: 5,    values: [1000n, 5000n, 0n, 0n, 12345n] },
  { name: 'ticketLevel',         type: 'i64',    count: 5,    values: [10n,8n,5n,2n,1n] },
  { name: 'ticketXp',            type: 'bigint', count: 5,    values: [0n,0n,0n,0n,0n] },
  { name: 'ticketStock',         type: 'i32',    count: 5,    values: [99,99,50,10,1] },
  { name: 'bestHand',            type: 'i32',    count: 1,    values: 4 },
  { name: 'pachiPinLevels',      type: 'i64',    count: 136,  values: Array.from({length: 136}, () => 7n) },
  { name: 'pachiPinXp',          type: 'bigint', count: 136,  values: Array.from({length: 136}, () => 100n) },
  { name: 'costReductionAccumulation', type: 'f64', count: 5, values: [0.1, 0.2, 0.3, 0.4, 0.5] },
  { name: 'highestSushiAchieved',type: 'i32',    count: 1,    values: 50 },
  { name: 'sushiBoardType',      type: 'i32',    count: 102,  values: Array.from({length: 102}, () => 1) },
  { name: 'sushiType',           type: 'i32',    count: 102,  values: Array.from({length: 102}, (_, i) => i) },
  { name: 'shakerUses',          type: 'i64',    count: 4,    values: [100n, 200n, 50n, 0n] },
  { name: 'perfecto',            type: 'bool',   count: 70,   values: Array.from({length: 70}, (_, i) => i % 7 === 0) },
  { name: 'sushiLevel',          type: 'i64',    count: 70,   values: Array.from({length: 70}, (_, i) => BigInt(i + 1)) },
  { name: 'sushiXP',             type: 'i64',    count: 70,   values: Array.from({length: 70}, () => 0n) },
  { name: 'greenShakeMulti',     type: 'f64',    count: 1,    values: 1.0 },
  { name: 'sushiSaved',          type: 'bool',   count: 1,    values: true },
  { name: 'wheelWin',            type: 'bool',   count: 2,    values: [true, false] },
  { name: 'wheelSpinCount',      type: 'i64',    count: 1,    values: 250n },
  { name: 'miniGameMulti',       type: 'f64',    count: 3,    values: [2.0, 1.5, 1.0] },
  { name: 'wheelPitySpins',      type: 'i32',    count: 1,    values: 3 },
  { name: 'pachiBalls',          type: 'bigint', count: 1,    values: 7777n },
  { name: 'fuel',                type: 'bigint', count: 1,    values: 500n },
  { name: 'tokens',              type: 'bigint', count: 1,    values: 100n },
  { name: 'tutorialCounters',    type: 'i32',    count: 21,   values: Array.from({length: 21}, () => 0) },
  { name: 'bottle',              type: 'i32',    count: 1,    values: 5 },
  { name: 'janitorMulti',        type: 'f64',    count: 1,    values: 1.0 },
  { name: 'wellRestedMarks',     type: 'i32',    count: 1,    values: 12 },
  { name: 'gumballLevels',       type: 'i64',    count: 8,    values: [3n,5n,2n,1n,0n,0n,0n,0n] },
  { name: 'unlockedWorlds',      type: 'i32',    count: 1,    values: 7 },
  { name: 'startedGame',         type: 'bool',   count: 1,    values: true },
  { name: 'completedGame',       type: 'bool',   count: 1,    values: true },
  { name: 'bodyguardSummoned',   type: 'bool',   count: 5,    values: [false,true,false,true,false] },
  { name: 'gachaItems',          type: 'i32',    count: 84,   values: Array.from({length: 84}, (_, i) => i % 10) },
  { name: 'pachiLeverState',     type: 'i32',    count: 1,    values: 2 },
  { name: 'isLethalMode',        type: 'bool',   count: 1,    values: true },
  { name: 'NGPlus',              type: 'i64',    count: 1,    values: 3n },
  { name: 'zenithGemRank',       type: 'i64',    count: 1,    values: 5n },
  { name: 'zenithGemCount',      type: 'i64',    count: 1,    values: 999n },
  { name: 'zenithLevels',        type: 'i32',    count: 40,   values: Array.from({length: 40}, (_, i) => i) },
  { name: 'zenithCooldown',      type: 'i32',    count: 1,    values: 0 },
  { name: 'frameTimer',          type: 'i64',    count: 1,    values: 1234567n },
  { name: 'scratchSize',         type: 'f64',    count: 1,    values: 0.0 },
  { name: 'autoscratchOn',       type: 'bool',   count: 1,    values: false },
];

// Fill in any missing schema fields with defaults so buildSave doesn't choke.
const byName = new Map(realistic.map(f => [f.name, f]));
for (const def of Schema) {
  if (byName.has(def.name)) continue;
  const v = def.count ? new Array(def.count).fill(def.type === 'i64' || def.type === 'bigint' ? 0n : 0) :
                       (def.type === 'i64' || def.type === 'bigint' ? 0n : (def.type === 'bool' ? false : 0));
  realistic.push({ name: def.name, type: def.type, count: def.count || 1, values: v });
}

const bytes = Codec.buildSave(realistic);
const dump  = Codec.formatDump(realistic, 'realistic.sav', bytes.length, 0);

// 1. JS binary round-trip
const parsed = Codec.parseSave(bytes);
const rebuilt = Codec.buildSave(parsed.fields);
let pass = true;
if (rebuilt.length !== bytes.length) { console.error('Length mismatch'); pass = false; }
for (let i = 0; i < bytes.length; i++) if (bytes[i] !== rebuilt[i]) { console.error('Byte mismatch at 0x'+i.toString(16)); pass = false; break; }
console.log(`JS binary round-trip:    ${pass ? 'OK' : 'FAIL'}  (${bytes.length} bytes)`);

// 2. JS dump round-trip
const reparsed = Codec.parseDump(dump);
const reRebuilt = Codec.buildSave(reparsed);
let dumpPass = (reRebuilt.length === bytes.length);
if (dumpPass) for (let i = 0; i < bytes.length; i++) if (reRebuilt[i] !== bytes[i]) { dumpPass = false; break; }
console.log(`JS dump round-trip:      ${dumpPass ? 'OK' : 'FAIL'}`);

// 3. Cross-tool: write dump to disk, ask Python to read it and re-serialize, then compare.
fs.writeFileSync(path.join(root, '_realistic_dump.txt'), dump);
try {
  const out = execSync(
    `python "${path.join(root, '..', 'fortune_mill_dump_to_sav.py')}" _realistic_dump.txt _python_roundtrip.sav`,
    { cwd: root, encoding: 'utf8' }
  );
  console.log('Python:', out.trim());
  const pythonBytes = fs.readFileSync(path.join(root, '_python_roundtrip.sav'));
  let xPass = (pythonBytes.length === bytes.length);
  if (xPass) for (let i = 0; i < bytes.length; i++) if (pythonBytes[i] !== bytes[i]) { xPass = false; break; }
  console.log(`JS -> Python -> JS:      ${xPass ? 'OK' : 'FAIL'}  (JS ${bytes.length} B, Python ${pythonBytes.length} B)`);
} catch (e) {
  console.error('Python cross-tool test failed:', e.message);
}

// 4. Reverse cross-tool: use Python dumper on the JS-built .sav, then re-serialize.
fs.writeFileSync(path.join(root, '_js_built.sav'), bytes);
try {
  const dump2 = execSync(
    `python "${path.join(root, '..', 'fortune_mill_dumper.py')}" _js_built.sav --txt _python_redump.txt`,
    { cwd: root, encoding: 'utf8' }
  );
  const redump = fs.readFileSync(path.join(root, '_python_redump.txt'), 'utf8');
  const reparsed2 = Codec.parseDump(redump);
  const reRebuilt2 = Codec.buildSave(reparsed2);
  let rPass = (reRebuilt2.length === bytes.length);
  if (rPass) for (let i = 0; i < bytes.length; i++) if (reRebuilt2[i] !== bytes[i]) { rPass = false; break; }
  console.log(`JS -> Python dumper -> JS: ${rPass ? 'OK' : 'FAIL'}`);

  // Compare the first 12 lines of the Python dumper output vs our formatDump.
  const ourLines = dump.split('\n').slice(0, 16);
  const pythonLines = redump.split('\n').slice(0, 16);
  console.log('\n--- format parity sample (first 16 lines) ---');
  for (let i = 0; i < 16; i++) {
    const same = ourLines[i] === pythonLines[i];
    console.log(`${same ? '  ' : '✗ '}ours:   ${ourLines[i]}`);
    if (!same) console.log(`   python: ${pythonLines[i]}`);
  }
} catch (e) {
  console.error('Python reverse cross-tool test failed:', e.message);
}

// Cleanup
for (const f of ['_realistic_dump.txt','_python_roundtrip.sav','_python_redump.txt','_js_built.sav']) {
  try { fs.unlinkSync(path.join(root, f)); } catch {}
}
process.exit((pass && dumpPass) ? 0 : 1);
