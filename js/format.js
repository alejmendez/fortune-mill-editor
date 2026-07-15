/**
 * Fortune Mill save format — field schema.
 *
 * Mirrors the order and types used by fortune_mill_dumper.py / fortune_mill_dump_to_sav.py
 * (Godot + .NET, little-endian, int/long stored with INT_OFFSET = 65536).
 *
 * Each entry describes one serialized field:
 *   { name, type, count? }
 *
 * Types:
 *   u32    — raw uint32 (no offset). Used for the "version" field.
 *   i32    — int32 stored as uint32 + 65536.
 *   i64    — int64 stored as uint64 + 65536.
 *   bool   — 1 byte: 0 = false, anything else = true.
 *   f64    — IEEE 754 double, little-endian.
 *   bigint — .NET-style BigInteger: 4 bytes length (little-endian u32) + N bytes payload
 *            interpreted as little-endian two's complement.
 *
 * `count` (optional) means the field is an array of that length, encoded contiguously.
 *
 * Group is for the UI only (collapsible sections) and does not affect serialization.
 */
(function (global) {
  'use strict';

  const INT_OFFSET = 65536n;

  /**
   * Single source of truth for the file byte order.
   *
   * IMPORTANT: the order in this array MUST match the on-disk layout used by
   * the Python dumper/writer. `group` is purely a UI label and does not
   * influence serialization.
   *
   * Each entry has:
   *   - name        — the exact field name produced by the Python dumper
   *                   (also what you see in save_dump.txt).
   *   - displayName — human-friendly label shown in the editor.
   *   - type        — u32 / i32 / i64 / bool / f64 / bigint.
   *   - count       — optional array length.
   *   - group       — UI grouping for the sidebar.
   *   - hint        — optional tooltip explaining what the field means.
   */
  const SCHEMA = [
    // ---------------- Version ----------------
    { name: 'version',             type: 'u32',   group: 'version',
      displayName: 'Save Version', hint: 'Format version of the save file.' },

    // ---------------- Currencies ----------------
    { name: 'currencyArray',       type: 'bigint', count: 6, group: 'currencies',
      displayName: 'Soft Currency',
      hint: 'In-game soft currency balances, one per world / pool.' },
    { name: 'secretCurrencyArray', type: 'bigint', count: 6, group: 'currencies',
      displayName: 'Secret Currency',
      hint: 'Hidden / bonus currency balances, one per slot.' },

    // ---------------- Upgrades ----------------
    { name: 'upgradeLevels',       type: 'i64',   count: 232, group: 'upgrades',
      displayName: 'Upgrade Levels',
      hint: 'Level of each of the 232 upgrades you can buy.' },
    { name: 'secretShopLevels',    type: 'i64',   count: 20,  group: 'upgrades',
      displayName: 'Secret Shop Levels',
      hint: 'Levels of the 20 secret-shop upgrades.' },

    // ---------------- Magic ----------------
    { name: 'magicRank',           type: 'i64',   group: 'magic',
      displayName: 'Magic Rank',
      hint: 'Current magic rank / tier.' },
    { name: 'magicXP',             type: 'bigint',group: 'magic',
      displayName: 'Magic XP',
      hint: 'XP accumulated in the magic system.' },
    { name: 'magicStats',          type: 'i64',   count: 9,    group: 'magic',
      displayName: 'Magic Stats',
      hint: 'Nine per-stat magic bonuses.' },
    { name: 'trialMulti',          type: 'f64',   group: 'magic',
      displayName: 'Trial Multiplier',
      hint: 'Score multiplier from the trial minigame.' },
    { name: 'shadowRealmSkeletons',type: 'i64',   group: 'magic',
      displayName: 'Shadow Realm Skeletons',
      hint: 'How many skeletons you\'ve cleared in the Shadow Realm.' },

    // ---------------- Jackpot / Tickets ----------------
    { name: 'jackpotGot',          type: 'bool',  count: 5, group: 'tickets',
      displayName: 'Jackpot Got',
      hint: 'Whether each jackpot tier has been won at least once.' },
    { name: 'bestTicketWin',       type: 'bigint',count: 5, group: 'tickets',
      displayName: 'Best Ticket Win',
      hint: 'Biggest single ticket win, per tier.' },
    { name: 'ticketLevel',         type: 'i64',   count: 5, group: 'tickets',
      displayName: 'Ticket Level',
      hint: 'Ticket tier level (one per ticket slot).' },
    { name: 'ticketXp',            type: 'bigint',count: 5, group: 'tickets',
      displayName: 'Ticket XP',
      hint: 'XP per ticket slot.' },
    { name: 'ticketStock',         type: 'i32',   count: 5, group: 'tickets',
      displayName: 'Ticket Stock',
      hint: 'How many tickets you own per slot.' },
    { name: 'bestHand',            type: 'i32',          group: 'tickets',
      displayName: 'Best Hand',
      hint: 'Highest poker-style hand value achieved.' },

    // ---------------- Pachi Pinball ----------------
    { name: 'pachiPinLevels',      type: 'i64',   count: 136, group: 'pachi',
      displayName: 'Pachi Pin Levels',
      hint: 'Level of each of the 136 pachi pinball targets.' },
    { name: 'pachiPinXp',          type: 'bigint',count: 136, group: 'pachi',
      displayName: 'Pachi Pin XP',
      hint: 'XP per pachi pinball target.' },

    // ---------------- Sushi (in-file order) ----------------
    { name: 'costReductionAccumulation', type: 'f64', count: 5, group: 'sushi',
      displayName: 'Cost Reduction',
      hint: 'Cumulative cost reduction per sushi line (fraction, 0..1).' },
    { name: 'highestSushiAchieved',type: 'i32',           group: 'sushi',
      displayName: 'Highest Sushi Achieved',
      hint: 'Highest sushi-tier you\'ve reached.' },
    { name: 'sushiBoardType',      type: 'i32',  count: 102, group: 'sushi',
      displayName: 'Sushi Board Type',
      hint: 'Type of each cell on the 102-cell sushi board.' },
    { name: 'sushiType',           type: 'i32',  count: 102, group: 'sushi',
      displayName: 'Sushi Type',
      hint: 'Per-cell sushi value (-1 = empty, otherwise tier id).' },
    { name: 'shakerUses',          type: 'i64',  count: 4,    group: 'sushi',
      displayName: 'Shaker Uses',
      hint: 'How many times each of the 4 shakers has been used.' },
    { name: 'perfecto',            type: 'bool', count: 70,   group: 'sushi',
      displayName: 'Perfecto',
      hint: 'Whether you\'ve achieved "perfecto" on each of the 70 sushi lines.' },
    { name: 'sushiLevel',          type: 'i64',  count: 70,   group: 'sushi',
      displayName: 'Sushi Level',
      hint: 'Level per sushi line.' },
    { name: 'sushiXP',             type: 'i64',  count: 70,   group: 'sushi',
      displayName: 'Sushi XP',
      hint: 'XP per sushi line.' },
    { name: 'greenShakeMulti',     type: 'f64',            group: 'sushi',
      displayName: 'Green Shake Multiplier',
      hint: 'Bonus multiplier from green shakes.' },

    // ---------------- Wheel / Minigames ----------------
    { name: 'wheelWin',            type: 'bool', count: 2, group: 'wheel',
      displayName: 'Wheel Win',
      hint: 'Whether each of the 2 wheel tiers has been won.' },
    { name: 'wheelSpinCount',      type: 'i64',         group: 'wheel',
      displayName: 'Wheel Spins',
      hint: 'How many times the wheel has been spun.' },
    { name: 'miniGameMulti',       type: 'f64', count: 3, group: 'wheel',
      displayName: 'Minigame Multipliers',
      hint: 'Three minigame score multipliers.' },

    // ---------------- Currencies (later block) ----------------
    { name: 'pachiBalls',          type: 'bigint', group: 'currencies',
      displayName: 'Pachi Balls',
      hint: 'Pinball balls counter.' },
    { name: 'fuel',                type: 'bigint', group: 'currencies',
      displayName: 'Fuel',
      hint: 'Fuel resource.' },
    { name: 'tokens',              type: 'bigint', group: 'currencies',
      displayName: 'Tokens',
      hint: 'Generic token balance.' },

    // ---------------- Tutorial / Bottle ----------------
    { name: 'tutorialCounters',    type: 'i32', count: 21, group: 'tutorial',
      displayName: 'Tutorial Counters',
      hint: '21 tutorial progress counters.' },
    { name: 'bottle',              type: 'i32',         group: 'tutorial',
      displayName: 'Bottle',
      hint: 'Bottle / flask item level.' },
    { name: 'janitorMulti',        type: 'f64',         group: 'tutorial',
      displayName: 'Janitor Multiplier',
      hint: 'Auto-cleanup multiplier (the "janitor" mechanic).' },

    // ---------------- Gumball ----------------
    { name: 'gumballLevels',       type: 'i64', count: 8, group: 'gumball',
      displayName: 'Gumball Levels',
      hint: 'Level of each of the 8 gumball machines.' },

    // ---------------- World / Progress ----------------
    { name: 'unlockedWorlds',      type: 'i32',         group: 'progress',
      displayName: 'Unlocked Worlds',
      hint: 'How many worlds you\'ve unlocked.' },
    { name: 'startedGame',         type: 'bool',        group: 'progress',
      displayName: 'Game Started',
      hint: 'Whether the game has been started at least once.' },
    { name: 'completedGame',       type: 'bool',        group: 'progress',
      displayName: 'Game Completed',
      hint: 'Whether the game has been completed (main ending).' },
    { name: 'bodyguardSummoned',   type: 'bool', count: 5, group: 'progress',
      displayName: 'Bodyguard Summoned',
      hint: 'Whether each of the 5 bodyguards has been summoned.' },

    // NOTE: `sushiSaved` lives here in the on-disk order, not in the sushi group.
    { name: 'sushiSaved',          type: 'bool',        group: 'sushi',
      displayName: 'Sushi Saved',
      hint: 'Whether the sushi minigame state has been saved.' },

    // ---------------- Gacha ----------------
    { name: 'gachaItems',          type: 'i32', count: 84, group: 'gacha',
      displayName: 'Gacha Items',
      hint: 'Inventory of the 84 gacha items (-1 = empty).' },

    // NOTE: `wellRestedMarks` lives here, not in the tutorial group.
    { name: 'wellRestedMarks',     type: 'i32',         group: 'tutorial',
      displayName: 'Well-Rested Marks',
      hint: 'Bonus marks from resting.' },

    // ---------------- Lethal / NG+ ----------------
    { name: 'pachiLeverState',     type: 'i32',         group: 'lethal',
      displayName: 'Pachi Lever State',
      hint: 'Position / state of the pachi lever.' },
    { name: 'isLethalMode',        type: 'bool',        group: 'lethal',
      displayName: 'Lethal Mode',
      hint: 'Whether lethal mode is currently active.' },
    { name: 'NGPlus',              type: 'i64',         group: 'lethal',
      displayName: 'NG+ Cycle',
      hint: 'New Game+ cycle number (0 = first run).' },

    // ---------------- Misc (in-file order) ----------------
    { name: 'frameTimer',          type: 'i64',         group: 'misc',
      displayName: 'Frame Timer',
      hint: 'Raw internal frame timer.' },
    { name: 'scratchSize',         type: 'f64',         group: 'misc',
      displayName: 'Scratch Size',
      hint: 'Scratch-card reveal size (0..1).' },
    { name: 'wheelPitySpins',      type: 'i32',         group: 'wheel',
      displayName: 'Wheel Pity Spins',
      hint: 'Spins since the last wheel win (pity counter).' },
    { name: 'autoscratchOn',       type: 'bool',        group: 'misc',
      displayName: 'Autoscratch',
      hint: 'Whether auto-scratch is enabled.' },

    // ---------------- Zenith ----------------
    { name: 'zenithGemRank',       type: 'i64',         group: 'zenith',
      displayName: 'Zenith Gem Rank',
      hint: 'Rank tier of the zenith gem.' },
    { name: 'zenithGemCount',      type: 'i64',         group: 'zenith',
      displayName: 'Zenith Gem Count',
      hint: 'How many zenith gems you have.' },
    { name: 'zenithLevels',        type: 'i32', count: 40, group: 'zenith',
      displayName: 'Zenith Levels',
      hint: 'Level of each of the 40 zenith upgrades.' },
    { name: 'zenithCooldown',      type: 'i32',         group: 'zenith',
      displayName: 'Zenith Cooldown',
      hint: 'Cooldown timer for the zenith mechanic.' },
  ];

  /** Group metadata: title + icon. The order here controls the sidebar/group order. */
  const GROUPS = [
    { id: 'version',    title: 'Version',                 icon: 'V' },
    { id: 'currencies', title: 'Currencies',              icon: '$' },
    { id: 'upgrades',   title: 'Upgrades',                icon: 'U' },
    { id: 'magic',      title: 'Magic',                   icon: 'M' },
    { id: 'tickets',    title: 'Tickets / Jackpot',       icon: 'T' },
    { id: 'pachi',      title: 'Pachi Pinball',           icon: 'P' },
    { id: 'sushi',      title: 'Sushi',                   icon: 'S' },
    { id: 'wheel',      title: 'Wheel & Minigames',       icon: 'W' },
    { id: 'tutorial',   title: 'Tutorial & Bottle',       icon: 'B' },
    { id: 'gumball',    title: 'Gumball',                 icon: 'G' },
    { id: 'progress',   title: 'World & Progress',        icon: 'W' },
    { id: 'gacha',      title: 'Gacha',                   icon: 'X' },
    { id: 'lethal',     title: 'Lethal / NG+',            icon: 'L' },
    { id: 'zenith',     title: 'Zenith',                  icon: 'Z' },
    { id: 'misc',       title: 'Misc',                    icon: 'i' },
  ];

  global.FortuneMill = global.FortuneMill || {};
  global.FortuneMill.Schema = SCHEMA;
  global.FortuneMill.Groups = GROUPS;
  global.FortuneMill.IntOffset = INT_OFFSET;
})(typeof window !== 'undefined' ? window : globalThis);
