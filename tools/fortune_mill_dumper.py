from __future__ import annotations
import argparse
import json
import struct
from pathlib import Path

INT_OFFSET = 65536
GACHA_ITEM_LIST_LENGTH = 84


class Reader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        self.fields = []

    def tell(self):
        return self.pos

    def _read(self, n: int) -> bytes:
        if self.pos + n > len(self.data):
            raise EOFError(f"EOF at 0x{self.pos:X}, need {n} bytes")
        b = self.data[self.pos:self.pos + n]
        self.pos += n
        return b

    def u8(self):
        return self._read(1)[0]

    def u32(self):
        return struct.unpack('<I', self._read(4))[0]

    def u64(self):
        return struct.unpack('<Q', self._read(8))[0]

    def f64(self):
        return struct.unpack('<d', self._read(8))[0]

    def add(self, name, typ, start, value):
        self.fields.append({
            "name": name,
            "type": typ,
            "offset_hex": f"0x{start:04X}",
            "offset": start,
            "value": value,
        })

    def read_int(self, name):
        s = self.tell()
        v = int(self.u32() - INT_OFFSET)
        self.add(name, 'int', s, v)
        return v

    def read_long(self, name):
        s = self.tell()
        v = int(self.u64() - INT_OFFSET)
        self.add(name, 'long', s, v)
        return v

    def read_bool(self, name):
        s = self.tell()
        raw = self.u8()
        v = raw > 0
        self.add(name, 'bool', s, v)
        return v

    def read_double(self, name):
        s = self.tell()
        v = self.f64()
        self.add(name, 'double', s, v)
        return v

    def read_bigint(self, name):
        s = self.tell()
        n = self.u32()
        b = self._read(n)
        v = int.from_bytes(b, 'little', signed=True) if n else 0
        self.add(name, 'BigInteger', s, v)
        return v

    def arr(self, base, count, fn):
        return [fn(f"{base}[{i}]") for i in range(count)]


def parse(data: bytes):
    r = Reader(data)
    s = r.tell()
    version = r.u32()
    r.add('version', 'uint32', s, version)

    r.arr('currencyArray', 6, r.read_bigint)
    r.arr('secretCurrencyArray', 6, r.read_bigint)
    r.arr('upgradeLevels', 232, r.read_long)
    r.arr('secretShopLevels', 20, r.read_long)
    r.read_long('magicRank')
    r.read_bigint('magicXP')
    r.arr('magicStats', 9, r.read_long)
    r.read_double('trialMulti')
    r.read_long('shadowRealmSkeletons')
    r.arr('jackpotGot', 5, r.read_bool)
    r.arr('bestTicketWin', 5, r.read_bigint)
    r.arr('ticketLevel', 5, r.read_long)
    r.arr('ticketXp', 5, r.read_bigint)
    r.arr('ticketStock', 5, r.read_int)
    r.read_int('bestHand')
    r.arr('pachiPinLevels', 136, r.read_long)
    r.arr('pachiPinXp', 136, r.read_bigint)
    r.arr('costReductionAccumulation', 5, r.read_double)
    r.read_int('highestSushiAchieved')
    r.arr('sushiBoardType', 102, r.read_int)
    r.arr('sushiType', 102, r.read_int)
    r.arr('shakerUses', 4, r.read_long)
    r.arr('perfecto', 70, r.read_bool)
    r.arr('sushiLevel', 70, r.read_long)
    r.arr('sushiXP', 70, r.read_long)
    r.read_double('greenShakeMulti')
    r.arr('wheelWin', 2, r.read_bool)
    r.read_long('wheelSpinCount')
    r.arr('miniGameMulti', 3, r.read_double)
    r.read_bigint('pachiBalls')
    r.read_bigint('fuel')
    r.read_bigint('tokens')
    r.arr('tutorialCounters', 21, r.read_int)
    r.read_int('bottle')
    r.read_double('janitorMulti')
    r.arr('gumballLevels', 8, r.read_long)
    r.read_int('unlockedWorlds')
    r.read_bool('startedGame')
    r.read_bool('completedGame')
    r.arr('bodyguardSummoned', 5, r.read_bool)
    r.read_bool('sushiSaved')
    r.arr('gachaItems', GACHA_ITEM_LIST_LENGTH, r.read_int)
    r.read_int('wellRestedMarks')
    r.read_int('pachiLeverState')
    r.read_bool('isLethalMode')
    r.read_long('NGPlus')
    r.read_long('frameTimer')
    r.read_double('scratchSize')
    r.read_int('wheelPitySpins')
    r.read_bool('autoscratchOn')
    r.read_long('zenithGemRank')
    r.read_long('zenithGemCount')
    r.arr('zenithLevels', 40, r.read_int)
    r.read_int('zenithCooldown')
    return r


def main():
    default = Path.home() / 'AppData' / 'Roaming' / 'Godot' / 'app_userdata' / 'Fortune Mill' / 'save_game.sav'

    ap = argparse.ArgumentParser(description='Fortune Mill save dumper')
    ap.add_argument('save', nargs='?', default=str(default), help='Path to save_game.sav')
    ap.add_argument('--txt', default='save_dump.txt', help='Output-TXT, Standard: save_dump.txt')
    ap.add_argument('--json', default=None, help='Optional JSON-Output')
    args = ap.parse_args()

    save = Path(args.save).expanduser()
    data = save.read_bytes()
    r = parse(data)
    by_name = {f['name']: f for f in r.fields}

    lines = []
    lines.append(f'Save: {save}')
    lines.append(f'File size: {len(data)} bytes, parsed until 0x{r.tell():X}')
    lines.append('')
    lines.append('IMPORTANT VALUES')
    for name in [
        'version', 'unlockedWorlds', 'startedGame', 'completedGame',
        'sushiSaved', 'isLethalMode', 'NGPlus',
        'zenithGemRank', 'zenithGemCount', 'zenithCooldown'
    ]:
        f = by_name[name]
        lines.append(f"{f['offset_hex']:>8}  {name:<18} {f['type']:<10} = {f['value']}")

    lines.append('')
    lines.append('ALL ENTRIES')
    for f in r.fields:
        lines.append(f"{f['offset_hex']:>8}  {f['name']:<32} {f['type']:<10} = {f['value']}")

    txt_path = Path(args.txt)
    txt_path.write_text('\n'.join(lines), encoding='utf-8')

    if args.json:
        Path(args.json).write_text(json.dumps(r.fields, indent=2, ensure_ascii=False), encoding='utf-8')

    print('Wrote:', txt_path.resolve())


if __name__ == '__main__':
    main()
