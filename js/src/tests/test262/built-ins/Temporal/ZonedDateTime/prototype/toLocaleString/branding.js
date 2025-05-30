// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2021 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.zoneddatetime.prototype.tolocalestring
description: Throw a TypeError if the receiver is invalid
features: [Symbol, Temporal]
---*/

const toLocaleString = Temporal.ZonedDateTime.prototype.toLocaleString;

assert.sameValue(typeof toLocaleString, "function");

assert.throws(TypeError, () => toLocaleString.call(undefined), "undefined");
assert.throws(TypeError, () => toLocaleString.call(null), "null");
assert.throws(TypeError, () => toLocaleString.call(true), "true");
assert.throws(TypeError, () => toLocaleString.call(""), "empty string");
assert.throws(TypeError, () => toLocaleString.call(Symbol()), "symbol");
assert.throws(TypeError, () => toLocaleString.call(1), "1");
assert.throws(TypeError, () => toLocaleString.call({}), "plain object");
assert.throws(TypeError, () => toLocaleString.call(Temporal.ZonedDateTime), "Temporal.ZonedDateTime");
assert.throws(TypeError, () => toLocaleString.call(Temporal.ZonedDateTime.prototype), "Temporal.ZonedDateTime.prototype");

reportCompare(0, 0);
