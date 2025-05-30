// |reftest| shell-option(--enable-explicit-resource-management) skip-if(!(this.hasOwnProperty('getBuildConfiguration')&&getBuildConfiguration('explicit-resource-management'))||!xulRuntime.shell) -- explicit-resource-management is not enabled unconditionally, requires shell-options
// Copyright (C) 2023 Ron Buckton. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-disposablestack.prototype.adopt
description: Returns the argument provided.
info: |
  DisposableStack.prototype.adopt ( value, onDispose )

  ...
  8. Return value.

features: [explicit-resource-management]
---*/

var stack = new DisposableStack();
var resource = {};
assert.sameValue(stack.adopt(resource, _ => {}), resource);
assert.sameValue(stack.adopt(null, _ => {}), null);
assert.sameValue(stack.adopt(undefined, _ => {}), undefined);

reportCompare(0, 0);
