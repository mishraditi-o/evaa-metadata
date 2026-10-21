
import test from "node:test";
import assert from "node:assert/strict";

import {
  extractEventMetadata,
  timestampToSeconds,
  buildPerformanceMetadata
} from "../index.js";;

test("does not assume timestamps are microseconds", () => {
  const result = extractEventMetadata([
    { t: 1, x: 0, y: 0, p: 1 },
    { t: 3, x: 1, y: 1, p: -1 }
  ]);

  assert.equal(result.timestamps.unit, "unknown");
  assert.equal(result.timestamps.durationUs, null);
  assert.equal(result.analytics.eventRatePerSecond, null);
});

test("calculates rate with a verified timestamp unit", () => {
  const result = extractEventMetadata(
    [
      { t: 1000, x: 0, y: 0, p: 1 },
      { t: 2000, x: 1, y: 0, p: -1 }
    ],
    {
      timestampUnit: "microseconds",
      width: 2,
      height: 1,
      resolutionSource: "provided_verified",
      resolutionVerified: true
    }
  );

  assert.equal(result.timestamps.durationUs, 1000);
  assert.equal(result.analytics.eventRatePerSecond, 2000);
  assert.equal(result.sensor.activePixelCount, 2);
  assert.equal(result.sensor.activePixelSparsityPercent, 100);
  assert.equal(result.sensor.resolutionVerified, true);
});

test("flags out-of-order events and estimated dimensions", () => {
  const result = extractEventMetadata(
    [
      { t: 9, x: 2, y: 3, p: 0 },
      { t: 4, x: 0, y: 1, p: 1 }
    ],
    { timestampUnit: "milliseconds" }
  );

  assert.equal(result.timestamps.sortedInput, false);
  assert.equal(result.sensor.width, 3);
  assert.equal(result.sensor.height, 4);
  assert.equal(result.sensor.resolutionVerified, false);
  assert.ok(result.dataQuality.warnings.length >= 2);
});

test("reports missing RTF and bandwidth measurements honestly", () => {
  const result = buildPerformanceMetadata();

  assert.equal(result.realTimeFactor, null);
  assert.equal(result.peakBandwidthBytesPerSecond, null);
});

test("calculates RTF and transfer rate from measurements", () => {
  const result = buildPerformanceMetadata({
    timings: {
      totalIngestionMs: 500
    },
    recordingDurationSeconds: 2,
    transfer: {
      bytesTransferred: 1000,
      durationSeconds: 2
    }
  });

  assert.equal(result.realTimeFactor, 4);
  assert.equal(result.peakBandwidthBytesPerSecond, 500);
});

test("converts only recognized timestamp units", () => {
  assert.equal(timestampToSeconds(1000, "milliseconds"), 1);
  assert.equal(timestampToSeconds(1000000, "microseconds"), 1);
  assert.equal(timestampToSeconds(1000, "unknown"), null);
});
