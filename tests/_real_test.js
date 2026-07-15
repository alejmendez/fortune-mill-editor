// Load the real Fortune Mill save and verify our codec handles it.
// Steps:
//  1. Read save_game.sav with the JS codec.
//  2. Print the parsed values (sanity).
//  3. Re-serialize and compare with original bytes.
//  4. Cross-check with the Python dumper: run it on the same file, compare dumps.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
console.log(`Real save: ${bytes.length} bytes`);

let parsed;
try {
  parsed = Codec.parseSave(bytes);
  console.log(`Parsed OK: ${parsed.fields.length} fields, endOffset=0x${parsed.endOffset.toString(16).toUpperCase()} (${parsed.endOffset}/${parsed.totalBytes})`);
} catch (e) {
  console.error('PARSE FAILED:', e.message);
  process.exit(1);
}

// Show important + first 20 fields
console.log('\n--- Important values ---');
const important = new Set([
  'version', 'unlockedWorlds', 'startedGame', 'completedGame',
  'sushiSaved', 'isLethalMode', 'NGPlus',
  'zenithGemRank', 'zenithGemCount', 'zenithCooldown',
  'magicRank', 'magicXP', 'trialMulti', 'shadowRealmSkeletons',
  'bestHand', 'highestSushiAchieved', 'bottle', 'frameTimer', 'scratchSize',
  'pachiLeverState', 'wheelSpinCount', 'wheelPitySpins', 'wellRestedMarks',
  'pachiBalls', 'fuel', 'tokens',
]);
for (const f of parsed.fields) {
  if (important.has(f.name)) {
    console.log(`  ${f.name.padEnd(24)} ${f.type.padEnd(8)} = ${f.values}`);
  }
}

console.log('\n--- Currencies ---');
for (const f of parsed.fields) {
  if (f.name === 'currencyArray' || f.name === 'secretCurrencyArray' ||
      f.name === 'pachiBalls' || f.name === 'fuel' || f.name === 'tokens') {
    const v = Array.isArray(f.values) ? `[${f.values.join(', ')}]` : f.values;
    console.log(`  ${f.name.padEnd(24)} ${f.type.padEnd(8)} = ${v}`);
  }
}

console.log('\n--- Array samples ---');
for (const f of parsed.fields) {
  if (f.count > 16 && f.count <= 100) {
    console.log(`  ${f.name}[0..9] = [${f.values.slice(0,10).join(', ')}]`);
  } else if (f.count > 100) {
    console.log(`  ${f.name}[0..9] = [${f.values.slice(0,10).join(', ')}]   (total ${f.count})`);
  }
}

// Round-trip: rebuild and compare
const rebuilt = Codec.buildSave(parsed.fields);
let pass = (rebuilt.length === bytes.length);
if (pass) for (let i = 0; i < bytes.length; i++) if (bytes[i] !== rebuilt[i]) { pass = false; console.error(`  byte mismatch at 0x${i.toString(16)}: ${bytes[i]} vs ${rebuilt[i]}`); break; }
console.log(`\nJS round-trip on real save: ${pass ? 'OK' : 'FAIL'}  (orig ${bytes.length} B, rebuilt ${rebuilt.length} B)`);

// Cross-check with Python dumper
console.log('\n--- Cross-check with Python dumper ---');
fs.writeFileSync(path.join(root, '_real_copy.sav'), bytes);
try {
  execSync(
    `python "${path.join(root, '..', 'fortune_mill_dumper.py')}" _real_copy.sav --txt _real_dump.txt`,
    { cwd: root, encoding: 'utf8' }
  );
  const pyDump = fs.readFileSync(path.join(root, '_real_dump.txt'), 'utf8');
  const jsDump = Codec.formatDump(parsed.fields, SAV, bytes.length, parsed.endOffset);

  // Compare line by line, ignoring the header (file path / size differ).
  const pyLines = pyDump.split('\n').filter(l => l.trim() && !l.startsWith('Save:') && !l.startsWith('File size:'));
  const jsLines = jsDump.split('\n').filter(l => l.trim() && !l.startsWith('Save:') && !l.startsWith('File size:'));
  console.log(`Python dump lines: ${pyLines.length}, JS dump lines: ${jsLines.length}`);

  let diffs = 0;
  const max = Math.max(pyLines.length, jsLines.length);
  for (let i = 0; i < max; i++) {
    const py = (pyLines[i] || '').replace(/\r$/, '');
    const js = (jsLines[i] || '').replace(/\r$/, '');
    if (py !== js) {
      diffs++;
      if (diffs <= 5) {
        console.error(`  Line ${i+1} differs:`);
        console.error(`    python: ${JSON.stringify(py)}`);
        console.error(`    js:     ${JSON.stringify(js)}`);
      }
    }
  }
  if (diffs === 0) console.log('Dumps match (after stripping header).');
  else console.log(`Dumps differ in ${diffs}/${max} lines.`);

  // Re-import the Python dump via JS, rebuild, compare with original.
  const reImported = Codec.parseDump(pyDump);
  const reBuilt = Codec.buildSave(reImported);
  let rePass = (reBuilt.length === bytes.length);
  if (rePass) for (let i = 0; i < bytes.length; i++) if (reBuilt[i] !== bytes[i]) { rePass = false; break; }
  console.log(`Python dump → JS rebuild: ${rePass ? 'OK' : 'FAIL'}  (orig ${bytes.length} B, rebuilt ${reBuilt.length} B)`);

} catch (e) {
  console.error('Python cross-check failed:', e.message);
}

// Cleanup
for (const f of ['_real_copy.sav','_real_dump.txt']) {
  try { fs.unlinkSync(path.join(root, f)); } catch {}
}
