// |reftest| shell-option(--enable-temporal) skip-if(!this.hasOwnProperty('Temporal')||!xulRuntime.shell) -- Temporal is not enabled unconditionally, requires shell-options
// Copyright (C) 2021 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.plaindate
description: Basic tests for the PlainDate constructor.
includes: [temporalHelpers.js]
features: [Temporal]
---*/

const plainDate = new Temporal.PlainDate(2020, 12, 24, "iso8601");
TemporalHelpers.assertPlainDate(plainDate, 2020, 12, "M12", 24, "with string");
assert.sameValue(plainDate.calendarId, "iso8601", "calendar string is iso8601");

reportCompare(0, 0);
