// |reftest| skip-if(!this.hasOwnProperty('AsyncIterator'))
/*---
description: The `length` property of AsyncIterator.prototype.find.
info: |
  ES7 section 17: Unless otherwise specified, the length property of a built-in
  Function object has the attributes { [[Writable]]: false, [[Enumerable]]:
  false, [[Configurable]]: true }.
---*/

const propDesc = Reflect.getOwnPropertyDescriptor(AsyncIterator.prototype.find, 'length');
assertEq(propDesc.value, 1);
assertEq(propDesc.writable, false);
assertEq(propDesc.enumerable, false);
assertEq(propDesc.configurable, true);

if (typeof reportCompare === 'function')
  reportCompare(0, 0);
