/**
 * Fortune Mill save editor — UI controller.
 *
 * Wires the schema + codec to a single-page editor:
 *   - Load .sav (binary)  → parse → fields in state
 *   - Load .txt dump      → parse → fields in state
 *   - Edit fields inline
 *   - Save .sav / Save .txt
 *   - Search, group navigation, raw mode
 */
(function (global) {
  'use strict';

  const Codec = global.FortuneMill.Codec;
  const Schema = global.FortuneMill.Schema;
  const Groups = global.FortuneMill.Groups;

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // --------------------------- State ---------------------------

  /** name -> { name, type, count, values } */
  const fieldsByName = new Map();
  /** Editable mirror used to build fresh arrays/scalars for save. */
  const values = new Map(); // name -> scalar | BigInt | number | boolean | array
  let filePath = null;
  let fileSize = 0;
  let endOffset = 0;
  let activeGroup = 'version';
  let showRaw = false;
  let dirty = false;
  let lastSavedBytes = null; // for "verify round-trip" hint
  let searchTerm = '';

  // --------------------------- Init ---------------------------

  document.addEventListener('DOMContentLoaded', () => {
    blankFields();
    renderSidebar();
    renderGroup();
    updateStatus();
    bindToolbar();
    bindGlobalKeys();
    initHelp();
  });

  // --------------------------- Field helpers ---------------------------

  function blankFields() {
    values.clear();
    fieldsByName.clear();
    for (const def of Schema) {
      fieldsByName.set(def.name, {
        name: def.name,
        type: def.type,
        count: def.count || 1,
        values: def.count ? new Array(def.count).fill(defaultFor(def.type)) : defaultFor(def.type),
      });
      values.set(def.name, fieldsByName.get(def.name).values);
    }
  }

  function defaultFor(type) {
    switch (type) {
      case 'u32': case 'i32': case 'f64': return 0;
      case 'i64': case 'bigint': return 0n;
      case 'bool': return false;
    }
    return 0;
  }

  function materializeFields() {
    // Pull values from `values` map and produce a fields array in schema order.
    return Schema.map(def => {
      const v = values.get(def.name);
      if (def.count) {
        return { name: def.name, type: def.type, count: def.count, values: v.slice() };
      }
      return { name: def.name, type: def.type, count: 1, values: v };
    });
  }

  // --------------------------- Sidebar ---------------------------

  function renderSidebar() {
    const nav = $('#group-nav');
    nav.innerHTML = '';
    for (const g of Groups) {
      const fieldsInGroup = Schema.filter(d => d.group === g.id);
      const total = fieldsInGroup.reduce((acc, d) => acc + (d.count || 1), 0);
      const btn = document.createElement('button');
      btn.className = 'group-btn' + (g.id === activeGroup ? ' active' : '');
      btn.dataset.group = g.id;
      btn.innerHTML = `<span class="g-icon">${g.icon}</span><span class="g-title">${g.title}</span><span class="g-count">${total}</span>`;
      btn.addEventListener('click', () => {
        activeGroup = g.id;
        showRaw = false;
        renderSidebar();
        renderGroup();
      });
      nav.appendChild(btn);
    }
  }

  // --------------------------- Group rendering ---------------------------

  function renderGroup() {
    const main = $('#main');
    main.innerHTML = '';

    // Toolbar (group-local)
    const toolbar = document.createElement('div');
    toolbar.className = 'group-toolbar';
    const groupTitle = (Groups.find(g => g.id === activeGroup) || {}).title || activeGroup;
    toolbar.innerHTML = `
      <h2>${groupTitle}</h2>
      <div class="group-actions">
        <input type="search" id="search" placeholder="Filter fields by name…" value="${escapeAttr(searchTerm)}" />
        <button id="toggle-raw" class="btn small ${showRaw ? 'active' : ''}">${showRaw ? 'Editor' : 'Raw'}</button>
      </div>
    `;
    main.appendChild(toolbar);

    const searchEl = $('#search', toolbar);
    searchEl.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim();
      renderGroupFields();
    });
    $('#toggle-raw', toolbar).addEventListener('click', () => {
      showRaw = !showRaw;
      renderGroup();
    });

    const groupFieldsHost = document.createElement('div');
    groupFieldsHost.id = 'group-fields';
    main.appendChild(groupFieldsHost);

    renderGroupFields();
  }

  function renderGroupFields() {
    const host = $('#group-fields');
    if (!host) return;
    host.innerHTML = '';

    if (showRaw) {
      renderRawView(host);
      return;
    }

    const fields = Schema.filter(d => d.group === activeGroup);
    for (const def of fields) {
      if (searchTerm && !def.name.toLowerCase().includes(searchTerm.toLowerCase())) continue;
      const card = renderFieldCard(def);
      host.appendChild(card);
    }
    if (!host.children.length) {
      host.innerHTML = `<div class="empty">No fields match the filter.</div>`;
    }
  }

  function renderFieldCard(def) {
    const card = document.createElement('section');
    card.className = `card type-${def.type} ${def.count && def.count > 16 ? 'card-wide' : ''}`;
    const isArr = !!def.count;
    const heading = document.createElement('header');
    heading.className = 'card-head';
    const displayName = def.displayName || def.name;
    const rawName = def.name + (isArr ? `[${def.count}]` : '');
    const hint = def.hint || '';
    heading.innerHTML = `
      <div class="card-title">
        <div class="card-display">${escapeHtml(displayName)}</div>
        <div class="card-raw" title="Exact field name in the Python dump file">${escapeHtml(rawName)}</div>
        ${hint ? `<div class="card-hint">${escapeHtml(hint)}</div>` : ''}
      </div>
      <div class="card-type">${def.type}</div>
    `;
    card.appendChild(heading);

    if (isArr) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (let i = 0; i < def.count; i++) {
        const cell = document.createElement('label');
        cell.className = 'cell';
        cell.innerHTML = `<span class="cell-i">${i}</span>`;
        cell.appendChild(makeInput(def.type, def.name, i));
        grid.appendChild(cell);
      }
      card.appendChild(grid);
      // Quick action: zero all, max → all, fill…
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      actions.innerHTML = `
        <button class="btn small" data-action="zero" data-name="${def.name}" title="Set every element to the type's default value (0 / false)">Zero all</button>
        <button class="btn small" data-action="max-from-array" data-name="${def.name}" title="Set every element to the largest value currently in the array">Max → all</button>
        <button class="btn small" data-action="max-i32" data-name="${def.name}" title="Set every element to 2^31-1 = 2147483647">Max i32</button>
        <button class="btn small" data-action="max-i64" data-name="${def.name}" title="Set every element to 2^63-1 = 9223372036854775807">Max i64</button>
        <button class="btn small" data-action="fill" data-name="${def.name}" title="Prompt for a single value and apply to all elements. Supports scientific notation (e.g. 1.29e24)">Fill…</button>
      `;
      card.appendChild(actions);
      actions.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const name = btn.dataset.name;
        const arr = values.get(name);
        const action = btn.dataset.action;
        if (action === 'zero') arr.fill(defaultFor(def.type));
        else if (action === 'max-i32') arr.fill(2147483647);
        else if (action === 'max-i64') {
          // For bigint, fill with the I64 max as a BigInt. For other types,
          // fill with the corresponding value (Number is safe up to 2^53).
          const v = def.type === 'i64' || def.type === 'bigint' ? I64_MAX : Number(I64_MAX);
          arr.fill(v);
        }
        else if (action === 'max-from-array') {
          let max = arr[0];
          for (let i = 1; i < arr.length; i++) if (arr[i] > max) max = arr[i];
          const defVal = defaultFor(def.type);
          const isDefault = (typeof max === 'bigint' && max === 0n) ||
                            (typeof max === 'number' && max === 0) ||
                            (typeof max === 'boolean' && max === defVal);
          if (isDefault) {
            alert(`Todos los elementos valen ${defVal}. Usá "Fill…" para asignar un valor.`);
            return;
          }
          arr.fill(max);
        }
        else if (action === 'fill') {
          const raw = prompt(`Fill all ${def.count} elements of "${name}" with value (supports 1.29e24):`, '0');
          if (raw == null) return;
          const v = parseTyped(def.type, raw);
          if (v == null) { alert('Invalid value for type ' + def.type); return; }
          arr.fill(v);
        }
        markDirty();
        renderGroupFields();
      });

      // Quick-set preset row (only for bigint / i64 arrays, where huge values matter)
      if (def.type === 'bigint' || def.type === 'i64') {
        const presets = document.createElement('div');
        presets.className = 'card-presets';
        presets.innerHTML = `<span class="preset-label">Quick set:</span>` +
          PRESETS.map(p => `<button class="btn xs" data-name="${def.name}" data-value="${p.v}">${p.label}</button>`).join('');
        card.appendChild(presets);
        presets.addEventListener('click', (e) => {
          const btn = e.target.closest('button');
          if (!btn) return;
          const name = btn.dataset.name;
          const v = BigInt(btn.dataset.value);
          const arr = values.get(name);
          arr.fill(v);
          markDirty();
          renderGroupFields();
        });
      }
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'scalar';
      wrap.appendChild(makeInput(def.type, def.name, null));
      // Magnitude hint for scalar bigint
      if (def.type === 'bigint' || def.type === 'i64') {
        const cur = values.get(def.name);
        const hint = document.createElement('div');
        hint.className = 'scalar-magnitude';
        const update = () => {
          const v = values.get(def.name);
          hint.textContent = formatMagnitude(v) || '';
        };
        update();
        wrap.appendChild(hint);
        // Re-render the hint when the input changes
        const inp = wrap.querySelector('.field-input');
        if (inp) inp.addEventListener('change', update);
        if (inp) inp.addEventListener('blur', update);
      }
      // Quick-set preset row for scalar bigint
      if (def.type === 'bigint' || def.type === 'i64') {
        const presets = document.createElement('div');
        presets.className = 'card-presets scalar-presets';
        presets.innerHTML = `<span class="preset-label">Quick set:</span>` +
          PRESETS.map(p => `<button class="btn xs" data-name="${def.name}" data-value="${p.v}">${p.label}</button>`).join('');
        card.appendChild(presets);
        presets.addEventListener('click', (e) => {
          const btn = e.target.closest('button');
          if (!btn) return;
          const name = btn.dataset.name;
          const v = BigInt(btn.dataset.value);
          values.set(name, v);
          markDirty();
          renderGroupFields();
        });
      }
    }

    return card;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
  }

  function makeInput(type, name, index) {
    const input = document.createElement('input');
    input.className = `field-input t-${type}`;
    input.dataset.name = name;
    if (index != null) input.dataset.index = String(index);

    const v = index == null ? values.get(name) : values.get(name)[index];

    if (type === 'bool') {
      input.type = 'checkbox';
      input.checked = Boolean(v);
      input.addEventListener('change', () => {
        if (index == null) values.set(name, input.checked);
        else values.get(name)[index] = input.checked;
        markDirty();
      });
    } else if (type === 'f64') {
      input.type = 'number';
      input.step = 'any';
      input.value = String(v);
      input.addEventListener('change', () => commit(input, type, name, index));
      input.addEventListener('blur',   () => commit(input, type, name, index));
    } else if (type === 'i32' || type === 'u32') {
      input.type = 'number';
      input.step = '1';
      input.value = String(v);
      input.addEventListener('change', () => commit(input, type, name, index));
      input.addEventListener('blur',   () => commit(input, type, name, index));
    } else {
      // i64 / bigint — accept huge integers and scientific notation
      input.type = 'text';
      input.inputMode = 'numeric';
      input.spellcheck = false;
      input.value = v == null ? '' : String(v);
      // Hover hint for big numbers
      if (v != null) {
        const mag = formatMagnitude(v);
        if (mag) input.title = mag;
      }
      input.addEventListener('change', () => commit(input, type, name, index));
      input.addEventListener('blur',   () => commit(input, type, name, index));
    }
    return input;
  }

  function commit(input, type, name, index) {
    const parsed = parseTyped(type, input.value);
    if (parsed == null) {
      // Restore previous value
      const prev = index == null ? values.get(name) : values.get(name)[index];
      input.value = prev == null ? '' : String(prev);
      input.classList.add('invalid');
      setTimeout(() => input.classList.remove('invalid'), 1200);
      return;
    }
    if (index == null) values.set(name, parsed);
    else values.get(name)[index] = parsed;
    // Reformat display
    if (type !== 'bool') input.value = String(parsed);
    // Update hover hint for big numbers
    if (type === 'i64' || type === 'bigint') {
      const mag = formatMagnitude(parsed);
      input.title = mag || '';
    }
    markDirty();
  }

  function parseTyped(type, text) {
    if (type === 'bool') return Boolean(text);
    const raw = String(text).trim();
    if (raw === '') {
      if (type === 'i64' || type === 'bigint') return 0n;
      if (type === 'f64') return 0;
      return 0;
    }
    try {
      if (type === 'i64' || type === 'bigint') {
        // Plain decimal integer
        if (/^-?\d+$/.test(raw)) return BigInt(raw);
        // Scientific notation (e.g. 1.29e24) — parsed exactly using BigInt
        // arithmetic so we don't lose precision through Number conversion.
        const sci = /^(-?)(\d+)(?:\.(\d+))?[eE]([-+]?\d+)$/.exec(raw);
        if (sci) {
          const sign = sci[1] === '-' ? -1n : 1n;
          const mantissa = BigInt(sci[2] + (sci[3] || ''));
          const exp = BigInt(sci[4]) - BigInt((sci[3] || '').length);
          const result = exp >= 0n
            ? mantissa * (10n ** exp)
            : mantissa / (10n ** (-exp));
          return sign * result;
        }
        return null;
      }
      if (type === 'i32' || type === 'u32') {
        // Accept plain integers or scientific notation
        if (/^-?\d+$/.test(raw)) return Math.trunc(Number(raw));
        if (/^-?\d+(\.\d+)?[eE][-+]?\d+$/.test(raw)) {
          const n = parseFloat(raw);
          if (!Number.isFinite(n)) return null;
          return Math.trunc(n);
        }
        return null;
      }
      if (type === 'f64') {
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) return null;
        return n;
      }
    } catch {
      return null;
    }
    return null;
  }

  /** Human-friendly magnitude hint for big numbers, e.g. "≈ 1.29 × 10^24". */
  function formatMagnitude(v) {
    if (typeof v !== 'bigint') return null;
    if (v === 0n) return null;
    const abs = v < 0n ? -v : v;
    const s = abs.toString();
    if (s.length < 16) return null; // readable as-is
    const exp = s.length - 1;
    const mantissa = s[0] + '.' + s.slice(1, 3);
    const sign = v < 0n ? '−' : '';
    return `≈ ${sign}${mantissa} × 10^${exp}`;
  }

  /** Predefined magnitude presets (1K, 1M, 1B, 1T, 1Q, 1Qi, 1Sx, 1Sp). */
  const PRESETS = [
    { label: '1K',  v: 1000n },
    { label: '1M',  v: 1000000n },
    { label: '1B',  v: 1000000000n },
    { label: '1T',  v: 1000000000000n },
    { label: '1Q',  v: 1000000000000000n },
    { label: '1Qi', v: 1000000000000000000n },
    { label: '1Sx', v: 1000000000000000000000n },
    { label: '1Sp', v: 1000000000000000000000000n },
  ];

  const I64_MAX = (1n << 63n) - 1n; // 9223372036854775807

  // --------------------------- Raw view ---------------------------

  function renderRawView(host) {
    const wrap = document.createElement('div');
    wrap.className = 'raw-wrap';
    const ta = document.createElement('textarea');
    ta.spellcheck = false;
    ta.value = buildDumpText();
    ta.addEventListener('input', () => { markDirty(); });
    ta.addEventListener('change', () => {
      // try to parse back
      try {
        const fields = Codec.parseDump(ta.value);
        for (const f of fields) {
          values.set(f.name, f.count > 1 ? f.values : f.values);
        }
        renderSidebar(); // counts may change
      } catch (e) {
        alert('Could not re-parse the dump: ' + e.message);
      }
    });
    wrap.appendChild(ta);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.innerHTML = `Edit the raw dump in the same format as <code>fortune_mill_dumper.py</code> produces. Changes are reflected in the editor view, and "Save .sav" will serialize them back to the binary format.`;
    wrap.appendChild(hint);
    host.appendChild(wrap);
  }

  function buildDumpText() {
    return Codec.formatDump(materializeFields(), filePath || '<unsaved>', fileSize, endOffset);
  }

  // --------------------------- Toolbar / IO ---------------------------

  function bindToolbar() {
    $('#btn-open-sav').addEventListener('click', () => $('#file-sav').click());
    $('#btn-open-txt').addEventListener('click', () => $('#file-txt').click());
    $('#btn-save-sav').addEventListener('click', saveAsSav);
    $('#btn-save-txt').addEventListener('click', saveAsTxt);
    $('#btn-reset').addEventListener('click', () => {
      if (dirty && !confirm('Discard unsaved changes?')) return;
      blankFields();
      filePath = null; fileSize = 0; endOffset = 0;
      dirty = false;
      renderSidebar();
      renderGroup();
      updateStatus();
    });
    $('#btn-roundtrip').addEventListener('click', runRoundTripCheck);

    $('#file-sav').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (f) await loadSavFile(f);
      e.target.value = '';
    });
    $('#file-txt').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (f) await loadTxtFile(f);
      e.target.value = '';
    });

    // Drop zone on the whole page
    document.addEventListener('dragover', (e) => { e.preventDefault(); });
    document.addEventListener('drop', async (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (!f) return;
      if (f.name.toLowerCase().endsWith('.sav')) await loadSavFile(f);
      else if (f.name.toLowerCase().endsWith('.txt') || f.name.toLowerCase().endsWith('.dump')) await loadTxtFile(f);
      else alert('Drop a .sav or .txt dump file.');
    });
  }

  function bindGlobalKeys() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveAsSav();
      }
    });
  }

  async function loadSavFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const result = Codec.parseSave(bytes);
      // Populate state
      filePath = file.name;
      fileSize = bytes.length;
      endOffset = result.endOffset;
      for (const f of result.fields) {
        values.set(f.name, f.count > 1 ? f.values : f.values);
      }
      dirty = false;
      lastSavedBytes = bytes;
      activeGroup = 'version';
      renderSidebar();
      renderGroup();
      updateStatus();
      setStatus(`Loaded ${file.name} (${fileSize} bytes)`, 'ok');
    } catch (e) {
      console.error(e);
      alert('Failed to parse: ' + e.message);
    }
  }

  async function loadTxtFile(file) {
    try {
      const text = await file.text();
      const fields = Codec.parseDump(text);
      for (const f of fields) {
        values.set(f.name, f.count > 1 ? f.values : f.values);
      }
      filePath = file.name;
      fileSize = 0;
      endOffset = 0;
      dirty = false;
      renderSidebar();
      renderGroup();
      updateStatus();
      setStatus(`Loaded dump ${file.name}`, 'ok');
    } catch (e) {
      console.error(e);
      alert('Failed to parse dump: ' + e.message);
    }
  }

  function saveAsSav() {
    try {
      const fields = materializeFields();
      const bytes = Codec.buildSave(fields);
      const name = (filePath && filePath.endsWith('.sav'))
        ? filePath.replace(/\.sav$/i, '.edited.sav')
        : 'save_edited.sav';
      downloadBytes(bytes, name);
      setStatus(`Wrote ${name} (${bytes.length} bytes)`, 'ok');
      lastSavedBytes = bytes;
      dirty = false;
      updateStatus();
    } catch (e) {
      console.error(e);
      alert('Failed to write: ' + e.message);
    }
  }

  function saveAsTxt() {
    try {
      const text = buildDumpText();
      const name = (filePath && filePath.endsWith('.sav'))
        ? filePath.replace(/\.sav$/i, '.dump.txt')
        : 'save_dump.txt';
      downloadBlob(new Blob([text], { type: 'text/plain' }), name);
      setStatus(`Wrote ${name}`, 'ok');
    } catch (e) {
      console.error(e);
      alert('Failed to write: ' + e.message);
    }
  }

  function runRoundTripCheck() {
    if (!lastSavedBytes) {
      setStatus('No file loaded — nothing to verify.', 'warn');
      return;
    }
    try {
      const fields = Codec.parseSave(lastSavedBytes);
      const rebuilt = Codec.buildSave(fields);
      const same = bytesEqual(lastSavedBytes, rebuilt);
      if (same) setStatus('Round-trip OK — parser and writer agree.', 'ok');
      else {
        setStatus(`Round-trip mismatch (orig ${lastSavedBytes.length} B, rebuilt ${rebuilt.length} B).`, 'err');
        console.warn('Original:', lastSavedBytes);
        console.warn('Rebuilt:', rebuilt);
      }
    } catch (e) {
      setStatus('Round-trip failed: ' + e.message, 'err');
    }
  }

  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // --------------------------- Status / utilities ---------------------------

  function updateStatus() {
    const path = filePath || '<no file loaded>';
    const size = fileSize ? `${fileSize} bytes` : '—';
    const parsed = endOffset ? `parsed 0x${endOffset.toString(16).toUpperCase()}` : '';
    $('#status-file').textContent = `File: ${path} · ${size}${parsed ? ' · ' + parsed : ''}`;
    $('#status-dirty').textContent = dirty ? '● unsaved changes' : '';
  }

  function markDirty() {
    if (!dirty) {
      dirty = true;
      updateStatus();
    } else {
      // still update sidebar counts if arrays changed
      renderSidebar();
    }
  }

  function setStatus(msg, kind) {
    const el = $('#status-msg');
    el.textContent = msg;
    el.dataset.kind = kind || '';
    setTimeout(() => {
      if (el.textContent === msg) {
        el.textContent = '';
        el.dataset.kind = '';
      }
    }, 5000);
  }

  function downloadBytes(bytes, name) {
    downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), name);
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
  }

  // --------------------------- Help modal ---------------------------

  const STORAGE_KEYS = {
    dismissed: 'fortune_mill_help_dismissed',
    username:  'fortune_mill_username',
  };

  /** Returns the game-save path template for the current OS. */
  function gamePathTemplate() {
    const platform = (navigator.platform || '').toLowerCase();
    const ua = (navigator.userAgent || '').toLowerCase();
    if (platform.includes('mac') || ua.includes('mac')) {
      return '/Users/{USERNAME}/Library/Application Support/Godot/app_userdata/Fortune Mill/save_game.sav';
    }
    if (platform.includes('linux') || ua.includes('linux')) {
      return '/home/{USERNAME}/.local/share/godot/app_userdata/Fortune Mill/save_game.sav';
    }
    return 'C:/Users/{USERNAME}/AppData/Roaming/Godot/app_userdata/Fortune Mill/save_game.sav';
  }

  function gamePathResolved(username) {
    return gamePathTemplate().replace('{USERNAME}', username || '{USERNAME}');
  }

  function initHelp() {
    const modal = $('#help-modal');
    const usernameInput = $('#username-input');
    const pathCode = $('#game-path');
    const dontShow = $('#dont-show-again');
    const copyBtn = $('#copy-path');
    const writeDirectBtn = $('#btn-write-direct');
    const writeDirectCallout = $('#write-direct-callout');

    // Restore remembered username (browser-local, never sent anywhere).
    const stored = localStorage.getItem(STORAGE_KEYS.username) || '';
    usernameInput.value = stored;
    updatePathDisplay();

    // Username input updates the path live.
    usernameInput.addEventListener('input', () => {
      localStorage.setItem(STORAGE_KEYS.username, usernameInput.value);
      updatePathDisplay();
    });

    function updatePathDisplay() {
      const u = usernameInput.value.trim();
      const tmpl = gamePathTemplate();
      if (u) {
        pathCode.innerHTML = escapeHtml(tmpl).replace(
          escapeHtml(u),
          `<span class="username-token">${escapeHtml(u)}</span>`,
        );
      } else {
        pathCode.innerHTML = escapeHtml(tmpl).replace(
          '{USERNAME}',
          `<span class="username-placeholder">{USERNAME}</span>`,
        );
      }
    }

    // Open / close
    $('#btn-help').addEventListener('click', openHelp);
    $('#modal-close').addEventListener('click', closeHelp);
    $('#modal-ok').addEventListener('click', closeHelp);
    modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', closeHelp));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) closeHelp();
    });

    dontShow.addEventListener('change', (e) => {
      localStorage.setItem(STORAGE_KEYS.dismissed, e.target.checked ? '1' : '0');
    });

    copyBtn.addEventListener('click', async () => {
      const path = gamePathResolved(usernameInput.value.trim());
      try {
        await navigator.clipboard.writeText(path);
        const orig = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied';
        copyBtn.classList.add('active');
        setTimeout(() => { copyBtn.textContent = orig; copyBtn.classList.remove('active'); }, 1500);
      } catch {
        // Fallback for non-secure contexts: select the text.
        const range = document.createRange();
        range.selectNodeContents(pathCode);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });

    // Show "Write directly" callout only if the browser supports the API.
    if (window.showSaveFilePicker) {
      writeDirectCallout.hidden = false;
      writeDirectBtn.addEventListener('click', async () => {
        try {
          // Build the bytes from the current state so we always write what's on screen.
          const fields = materializeFields();
          const bytes = Codec.buildSave(fields);
          const handle = await window.showSaveFilePicker({
            suggestedName: 'save_game.sav',
            types: [{ description: 'Fortune Mill save', accept: { 'application/octet-stream': ['.sav'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(bytes);
          await writable.close();
          setStatus(`Wrote ${handle.name} (${bytes.length} bytes) — restart the game to see changes.`, 'ok');
          closeHelp();
        } catch (e) {
          if (e && e.name === 'AbortError') return; // user cancelled
          console.error(e);
          alert('Could not write directly: ' + (e.message || e));
        }
      });
    }

    function openHelp() {
      modal.hidden = false;
      dontShow.checked = localStorage.getItem(STORAGE_KEYS.dismissed) === '1';
      updatePathDisplay();
      // Focus the username field only if it's still empty.
      if (!usernameInput.value) usernameInput.focus();
    }

    function closeHelp() {
      modal.hidden = true;
      if (dontShow.checked) localStorage.setItem(STORAGE_KEYS.dismissed, '1');
    }

    // Auto-show on first visit (slight delay so the page has time to settle).
    if (!localStorage.getItem(STORAGE_KEYS.dismissed)) {
      setTimeout(openHelp, 400);
    }
  }
})(window);
