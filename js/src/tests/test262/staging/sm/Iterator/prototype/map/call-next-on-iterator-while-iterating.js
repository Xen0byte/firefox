// |reftest| shell-option(--enable-iterator-helpers) skip-if(!this.hasOwnProperty('Iterator')||!xulRuntime.shell) -- iterator-helpers is not enabled unconditionally, requires shell-options
// Copyright (C) 2024 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: pending
description: |
  Call next on an iterator that is being iterated over.
features:
  - iterator-helpers
includes: [sm/non262.js, sm/non262-shell.js]
flags:
  - noStrict
---*/

const iterator = [1, 2, 3].values()
const items = [];

for (const item of iterator.map(x => x ** 2)) {
  const nextItem = iterator.next();
  items.push(item, nextItem.value);
}

assert.sameValue(items[0], 1);
assert.sameValue(items[1], 2);
assert.sameValue(items[2], 9);
assert.sameValue(items[3], undefined);


reportCompare(0, 0);
