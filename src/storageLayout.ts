/**
 * Pure logic -- no `vscode` dependency. New niche (not a port from
 * the Kotlin catalog). Evidence: confirmed -- "collision detection is
 * primarily handled through command-line tools... rather than
 * through dedicated VS Code extensions". Slither
 * (`--check-upgradeability`) and `@openzeppelin/upgrades-core` are
 * CLI/library, no editor equivalent.
 *
 * An upgradeable proxy contract's storage layout is the ORDER and
 * TYPE of its state variables -- Solidity assigns storage slots
 * sequentially at compile time, so removing, reordering, or retyping
 * an existing variable in a new implementation shifts every
 * subsequent variable's slot, silently corrupting the proxy's
 * persisted state. This scans state-variable declarations at the
 * contract's own top level (brace depth 1, skipping function/
 * modifier bodies) -- not a real Solidity compiler, a text/brace-depth
 * heuristic, same technique as this workstream's other "hand-rolled
 * scanner for one specific language shape" mechanisms.
 *
 * v0.1 scope, honestly noted: assumes one contract definition per
 * file (the common real-world layout for upgradeable implementation
 * contracts) and doesn't model Solidity's actual slot-packing rules
 * (multiple small types sharing one 32-byte slot) -- it compares
 * variable order and declared type text, which catches the
 * overwhelming majority of real collisions without needing a full
 * ABI-encoding-aware packer.
 */

export interface StateVariable {
  type: string;
  name: string;
}

const SKIP_LINE_START = /^(function|constructor|modifier|event|error|using|import|pragma|struct|enum|\/\/|\/\*|\*)/;
const VISIBILITY = /\b(public|private|internal|external)\b/g;

function findContractBodyRange(text: string): [number, number] | null {
  const contractMatch = /\b(contract|abstract\s+contract)\s+\w+[^{]*\{/.exec(text);
  if (!contractMatch) return null;
  const openIndex = contractMatch.index + contractMatch[0].length - 1;

  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return [openIndex + 1, i];
    }
  }
  return [openIndex + 1, text.length];
}

/** Extracts state-variable declarations at the contract's own top
 * level (depth 1 within the contract body), in declaration order --
 * the order and type sequence that determines real storage slots. */
export function extractStateVariables(text: string): StateVariable[] {
  const range = findContractBodyRange(text);
  if (!range) return [];
  const [start, end] = range;

  const variables: StateVariable[] = [];
  let depth = 0;

  for (const rawLine of text.slice(start, end).split('\n')) {
    const line = rawLine.trim();
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;

    if (depth === 0 && line !== '' && !SKIP_LINE_START.test(line) && !line.includes('constant') && !line.includes('immutable')) {
      const declMatch = /^(.+?)\s+([a-zA-Z_]\w*)\s*(=\s*[^;]*)?;$/.exec(line);
      if (declMatch) {
        const type = declMatch[1].replace(VISIBILITY, '').replace(/\s+/g, ' ').trim();
        variables.push({ type, name: declMatch[2] });
      }
    }

    depth += opens - closes;
    if (depth < 0) depth = 0;
  }

  return variables;
}

export interface StorageCollision {
  index: number;
  before: StateVariable | null;
  after: StateVariable | null;
  reason: string;
}

/** Compares two variable-order lists slot-by-slot (index by index --
 * the real storage-slot order). Any mismatch at a given index (a
 * variable removed, reordered, or retyped) is a real collision risk:
 * every variable AFTER that point may now read/write the wrong
 * storage slot. */
export function findStorageCollisions(before: StateVariable[], after: StateVariable[]): StorageCollision[] {
  const collisions: StorageCollision[] = [];
  const maxLength = Math.max(before.length, after.length);

  for (let i = 0; i < maxLength; i++) {
    const beforeVar = before[i] ?? null;
    const afterVar = after[i] ?? null;

    if (beforeVar === null) continue; // a new variable appended at the end -- safe, doesn't shift anything before it
    if (afterVar === null) {
      collisions.push({ index: i, before: beforeVar, after: null, reason: `variable "${beforeVar.name}" (slot ${i}) was removed -- every variable after it now reads the wrong slot.` });
      break; // everything after this point is a cascading consequence, not a separate new finding
    }
    if (beforeVar.name !== afterVar.name || beforeVar.type !== afterVar.type) {
      collisions.push({
        index: i,
        before: beforeVar,
        after: afterVar,
        reason: `slot ${i} was "${beforeVar.type} ${beforeVar.name}", is now "${afterVar.type} ${afterVar.name}" -- reordered or retyped.`,
      });
      break;
    }
  }

  return collisions;
}
