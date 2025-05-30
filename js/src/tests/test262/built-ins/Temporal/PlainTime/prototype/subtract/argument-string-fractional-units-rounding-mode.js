// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2022 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.plaintime.prototype.subtract
description: Strings with fractional duration units are rounded with the correct rounding mode
includes: [temporalHelpers.js]
features: [Temporal]
---*/

const midnight = new Temporal.PlainTime();

TemporalHelpers.assertPlainTime(midnight.subtract("PT1.03125H"), 22, 58, 7, 500, 0, 0,
  "positive fractional units rounded with correct rounding mode");
TemporalHelpers.assertPlainTime(midnight.subtract("-PT1.03125H"), 1, 1, 52, 500, 0, 0,
  "negative fractional units rounded with correct rounding mode");

reportCompare(0, 0);
