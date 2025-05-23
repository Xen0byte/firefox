// |reftest| shell-option(--setpref=atomics_wait_async) skip-if(!this.hasOwnProperty('Atomics')||!xulRuntime.shell) -- Atomics is not enabled unconditionally, requires shell-options
// Copyright (C) 2020 Rick Waldron. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-atomics.waitasync
description: >
  Atomics.waitAsync.name is "waitAsync".
includes: [propertyHelper.js]
features: [Atomics.waitAsync, Atomics]
---*/

verifyProperty(Atomics.waitAsync, 'name', {
  value: 'waitAsync',
  enumerable: false,
  writable: false,
  configurable: true,
});

reportCompare(0, 0);
