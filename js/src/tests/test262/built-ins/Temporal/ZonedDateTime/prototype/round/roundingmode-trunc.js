// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2022 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.zoneddatetime.prototype.round
description: Tests calculations with roundingMode "trunc".
features: [Temporal]
---*/

const instance = new Temporal.ZonedDateTime(217175010_123_987_500n /* 1976-11-18T15:23:30.1239875+01:00 */, "+01:00");

const expected = [
  ["day", 217119600_000_000_000n /* 1976-11-18T00:00:00+01:00 */],
  ["minute", 217174980_000_000_000n /* 1976-11-18T15:23:00+01:00 */],
  ["second", 217175010_000_000_000n /* 1976-11-18T15:23:30+01:00 */],
  ["millisecond", 217175010_123_000_000n /* 1976-11-18T15:23:30.123+01:00 */],
  ["microsecond", 217175010_123_987_000n /* 1976-11-18T15:23:30.123987+01:00 */],
  ["nanosecond", 217175010_123_987_500n /* 1976-11-18T15:23:30.1239875+01:00 */],
];

const roundingMode = "trunc";

expected.forEach(([smallestUnit, expected]) => {
  assert.sameValue(
    instance.round({ smallestUnit, roundingMode }).epochNanoseconds,
    expected,
    `rounds to ${smallestUnit} (roundingMode = ${roundingMode})`
  );
});

reportCompare(0, 0);
