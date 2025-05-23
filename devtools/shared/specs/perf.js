/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {
  Arg,
  Option,
  RetVal,
  generateActorSpec,
  BULK_RESPONSE,
} = require("resource://devtools/shared/protocol.js");

const perfDescription = {
  typeName: "perf",

  events: {
    "profiler-started": {
      type: "profiler-started",
      entries: Arg(0, "number"),
      interval: Arg(1, "number"),
      features: Arg(2, "number"),
      duration: Arg(3, "nullable:number"),
      // The `activeTabID` option passed to `profiler_start` is used to
      // determine the active tab when user starts the profiler.
      // This is a parameter that is generated on the
      // server, that's why we don't need to pass anything on `startProfiler`
      // actor method. But we return this in "profiler-started" event because
      // client may want to use that value.
      activeTabID: Arg(4, "number"),
    },
    "profiler-stopped": {
      type: "profiler-stopped",
    },
  },

  methods: {
    startProfiler: {
      request: {
        entries: Option(0, "number"),
        duration: Option(0, "nullable:number"),
        interval: Option(0, "number"),
        features: Option(0, "array:string"),
        threads: Option(0, "array:string"),
      },
      response: { value: RetVal("boolean") },
    },

    /* @backward-compat { version 140 }
     * Version 140 introduced getProfileAndStopProfilerBulk below, a more
     * efficient version of getProfileAndStopProfiler. getProfileAndStopProfiler
     * needs to stay to support older versions of Firefox. */
    getProfileAndStopProfiler: {
      request: {},
      response: RetVal("nullable:json"),
    },

    startCaptureAndStopProfiler: {
      request: {},
      response: { value: RetVal("number") },
    },

    getPreviouslyCapturedProfileDataBulk: {
      request: {
        handle: Arg(0, "number"),
      },
      response: BULK_RESPONSE,
    },

    getPreviouslyRetrievedAdditionalInformation: {
      request: {
        handle: Arg(0, "number"),
      },
      response: { value: RetVal("nullable:json") },
    },

    stopProfilerAndDiscardProfile: {
      request: {},
      response: {},
    },

    getSymbolTable: {
      request: {
        debugPath: Arg(0, "string"),
        breakpadId: Arg(1, "string"),
      },
      response: { value: RetVal("array:array:number") },
    },

    isActive: {
      request: {},
      response: { value: RetVal("boolean") },
    },

    isSupportedPlatform: {
      request: {},
      response: { value: RetVal("boolean") },
    },

    getSupportedFeatures: {
      request: {},
      response: { value: RetVal("array:string") },
    },
  },
};

exports.perfDescription = perfDescription;

const perfSpec = generateActorSpec(perfDescription);

exports.perfSpec = perfSpec;
