# Proxy Storage Collision Companion (VS Code)

Diffs a Solidity contract's state-variable layout against git `HEAD`
and flags storage-slot collisions — reordered, removed, or retyped
variables in an upgradeable proxy implementation. No data leaves your
editor (git is invoked locally, never network).

**v0.1, new niche.** Not a port from the Gap Hunter Labs IntelliJ-
family catalog. Evidence: confirmed — *"collision detection is
primarily handled through command-line tools... rather than through
dedicated VS Code extensions."* Slither's
`--check-upgradeability` and `@openzeppelin/upgrades-core` are CLI/
library only, no editor equivalent.

## Why this matters

Solidity assigns storage slots to state variables sequentially, in
declaration order, at compile time. In an upgradeable proxy pattern,
deploying a new implementation contract that removes, reorders, or
retypes an *existing* state variable silently corrupts every variable
that comes after it — the proxy's persisted storage doesn't move, but
the new implementation's code now reads/writes the wrong slots.

## What it does

**Command: `Proxy Storage Collision Companion: Check for Storage
Collisions`** — run it with a `.sol` file open. It extracts every
state-variable declaration at the contract's own top level (skipping
function/modifier bodies, and `constant`/`immutable` variables, which
don't occupy real storage slots) from both the current file and its
`git show HEAD:<path>` baseline, then compares them slot-by-slot. A
variable appended at the end is safe; anything that shifts an
existing slot's name or type is flagged.

**v0.1 scope, honestly noted:** assumes one contract definition per
file (the common layout for upgradeable implementation contracts) and
compares declared type text and order — it doesn't model Solidity's
real slot-packing rules (several small types sharing one 32-byte
slot), which catches the overwhelming majority of real collisions
without a full ABI-encoding-aware packer.

## Privacy

See [PRIVACY.md](PRIVACY.md) — zero network calls; `git show` runs
locally against your own repository history.

## Development

```bash
npm install
npm run compile   # or: npm run watch
npm test
```

To build an installable package without publishing:

```bash
npx @vscode/vsce package
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
