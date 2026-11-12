#!/usr/bin/env python3
"""Regenerate the code snippets in src/data/flashArbConfig.ts (FLASH_ARB_FILES) from the real files on disk,
so the dashboard viewer / downloadable zip can never drift from flash-arb/ again. Run: python3 scripts/sync-flash-arb-files.py"""
import os, re, sys

TS = 'src/data/flashArbConfig.ts'
EXTRA = [  # (key, lang, path) entries to add if missing
    ('evm.rs', 'rust', 'flash-arb/searcher/src/evm.rs'),
    ('config.rs', 'rust', 'flash-arb/searcher/src/config.rs'),
    ('FlashArbOptimized.t.sol', 'solidity', 'flash-arb/contracts/test/FlashArbOptimized.t.sol'),
    ('CHANGES.md', 'markdown', 'flash-arb/CHANGES.md'),
    ('Cargo.toml', 'toml', 'flash-arb/searcher/Cargo.toml'),
]

def esc(s):
    return s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

src = open(TS, encoding='utf-8').read()
pat = re.compile(r"(  '([^']+)': \{\n    lang: '([^']+)',\n    path: '([^']+)',\n    code: `)((?:[^`\\]|\\.)*)(`,\n  \},?\n)", re.S)
updated, missing = [], []

def repl(m):
    head, key, lang, path, _, tail = m.groups()
    if os.path.isfile(path):
        updated.append(key)
        return head + esc(open(path, encoding='utf-8').read().rstrip('\n')) + tail
    missing.append(key)
    return m.group(0)

src = pat.sub(repl, src)
have = set(re.findall(r"^  '([^']+)': \{", src, re.M))
add = ''
for key, lang, path in EXTRA:
    if key not in have and os.path.isfile(path):
        add += f"  '{key}': {{\n    lang: '{lang}',\n    path: '{path}',\n    code: `{esc(open(path, encoding='utf-8').read().rstrip(chr(10)))}`,\n  }},\n"
        updated.append(key)
if add:
    marker = "  'README.md': {"
    i = src.index(marker)
    src = src[:i] + add + src[i:]
open(TS, 'w', encoding='utf-8').write(src)
print('updated from disk:', ', '.join(updated))
print('no file on disk (left as-is):', ', '.join(missing) or '-')
