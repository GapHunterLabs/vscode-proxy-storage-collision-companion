import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractStateVariables, findStorageCollisions } from '../storageLayout';

const CONTRACT_V1 = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TokenV1 {
    uint256 public totalSupply;
    address public owner;
    mapping(address => uint256) public balances;
    uint256 public constant MAX_SUPPLY = 1000000;

    function mint(uint256 amount) public {
        totalSupply += amount;
    }

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }
}
`;

test('extractStateVariables reads variables in declaration order', () => {
  const vars = extractStateVariables(CONTRACT_V1);
  assert.deepEqual(
    vars.map((v) => v.name),
    ['totalSupply', 'owner', 'balances'],
  );
});

test('extractStateVariables excludes constant variables (not real storage)', () => {
  const vars = extractStateVariables(CONTRACT_V1);
  assert.ok(!vars.some((v) => v.name === 'MAX_SUPPLY'));
});

test('extractStateVariables excludes function-local declarations', () => {
  const vars = extractStateVariables(CONTRACT_V1);
  assert.equal(vars.length, 3); // not counting anything inside mint() or onlyOwner()
});

test('extractStateVariables strips visibility modifiers from the type for comparison', () => {
  const vars = extractStateVariables(CONTRACT_V1);
  const totalSupply = vars.find((v) => v.name === 'totalSupply')!;
  assert.equal(totalSupply.type, 'uint256');
});

test('extractStateVariables reads mapping types', () => {
  const vars = extractStateVariables(CONTRACT_V1);
  const balances = vars.find((v) => v.name === 'balances')!;
  assert.match(balances.type, /mapping\(address => uint256\)/);
});

test('findStorageCollisions reports nothing for an identical layout', () => {
  const vars = extractStateVariables(CONTRACT_V1);
  assert.deepEqual(findStorageCollisions(vars, vars), []);
});

test('findStorageCollisions allows a new variable appended at the end (safe)', () => {
  const before = extractStateVariables(CONTRACT_V1);
  const afterText = CONTRACT_V1.replace(
    'mapping(address => uint256) public balances;',
    'mapping(address => uint256) public balances;\n    bool public paused;',
  );
  const after = extractStateVariables(afterText);
  assert.deepEqual(findStorageCollisions(before, after), []);
});

test('findStorageCollisions flags removal of the LAST variable as "removed" (the array shrinks with nothing to compare at that slot)', () => {
  const before = extractStateVariables(CONTRACT_V1); // totalSupply, owner, balances
  const afterText = CONTRACT_V1.replace('mapping(address => uint256) public balances;\n    ', '');
  const after = extractStateVariables(afterText); // totalSupply, owner
  const collisions = findStorageCollisions(before, after);
  assert.equal(collisions.length, 1);
  assert.match(collisions[0].reason, /balances.*removed/);
});

test('findStorageCollisions flags removal from the MIDDLE as a slot-content change (everything after it shifted)', () => {
  const before = extractStateVariables(CONTRACT_V1); // totalSupply, owner, balances
  const afterText = CONTRACT_V1.replace('address public owner;\n    ', '');
  const after = extractStateVariables(afterText); // totalSupply, balances
  const collisions = findStorageCollisions(before, after);
  assert.equal(collisions.length, 1);
  // Correct and expected: from a pure slot-by-slot view, "owner" removed
  // from the middle is indistinguishable from slot 1 being retyped to
  // whatever shifted into it -- the message reflects that accurately.
  assert.match(collisions[0].reason, /slot 1 was "address owner"/);
});

test('findStorageCollisions flags a reordered variable', () => {
  const before = [
    { type: 'uint256', name: 'a' },
    { type: 'address', name: 'b' },
  ];
  const after = [
    { type: 'address', name: 'b' },
    { type: 'uint256', name: 'a' },
  ];
  const collisions = findStorageCollisions(before, after);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].index, 0);
});

test('findStorageCollisions flags a retyped variable at the same position', () => {
  const before = [{ type: 'uint128', name: 'x' }];
  const after = [{ type: 'uint256', name: 'x' }];
  const collisions = findStorageCollisions(before, after);
  assert.equal(collisions.length, 1);
  assert.match(collisions[0].reason, /retyped/);
});
