// Fixture: violation -- two childIds Set declarations (intentional invariant breach)
// This file is intentionally invalid TypeScript. Read as plain text only.
const childIds = new Set();
childIds.add('foo');
const childIds = new Set();
