
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  METADATA_SCHEMA_VERSION,
  SUPPORTED_FORMATS,
  TIMESTAMP_UNITS_PER_SECOND
} from "./constants.js";

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const round = (value, digits = 6) => {
  if (!isFiniteNumber(value)) return null;

  return Number(value.toFixed(digits));
};

const getFormat = (filename = "") =>
  path.extname(filename).slice(1).toLowerCase();

export function timestampToSeconds(duration, unit) {
  const factor = TIMESTAMP_UNITS_PER_SECOND[unit];

  if (!isFiniteNumber(duration) || !factor) {
    return null;
  }

  return duration / factor;
}

export async function buildFileMetadata({
  filePath,
  originalFileName,
  fileSizeBytes,
  format,
  processingStatus = "success",
  processingDurationMs = null
} = {}) {
  const filename =
    originalFileName ||
    (filePath ? path.basename(filePath) : null);

  let size = isFiniteNumber(fileSizeBytes)
    ? fileSizeBytes
    : null;

  if (size === null && filePath) {
    try {
      const stats = await fs.stat(filePath);
      size = stats.size;
    } catch {
      // File size remains unavailable if the file cannot be accessed.
    }
  }

  const detectedFormat = (
    format || getFormat(filename || filePath || "")
  ).toLowerCase();

  return {
    fileName: filename,
    format: detectedFormat
      ? detectedFormat.toUpperCase()
      : null,

    supportedFormat: SUPPORTED_FORMATS.has(detectedFormat),

    fileSizeBytes: size,

    fileSizeMB: size === null
      ? null
      : round(size / (1024 * 1024), 4),

    processingStatus,

    processingDurationMs:
      isFiniteNumber(processingDurationMs) &&
      processingDurationMs >= 0
        ? round(processingDurationMs, 3)
        : null
  };
}

export function extractEventMetadata(events, options = {}) {
  if (!Array.isArray(events)) {
    throw new TypeError(
      "events must be an array of { t, x, y, p } objects"
    );
  }

  const timestampUnit =
    TIMESTAMP_UNITS_PER_SECOND[options.timestampUnit]
      ? options.timestampUnit
      : "unknown";

  let minT = Infinity;
  let maxT = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  let validEventCount = 0;
  let invalidEventCount = 0;

  let positiveEventCount = 0;
  let negativeEventCount = 0;
  let zeroPolarityCount = 0;

  let sortedInput = true;
  let previousT = -Infinity;

  const polarityValues = new Set();
  const activePixels = new Set();
  const timestamps = [];

  for (const event of events) {
    const valid =
      event &&
      isFiniteNumber(event.t) &&
      Number.isInteger(event.x) &&
      Number.isInteger(event.y) &&
      isFiniteNumber(event.p) &&
      event.x >= 0 &&
      event.y >= 0 &&
      [-1, 0, 1].includes(event.p);

    if (!valid) {
      invalidEventCount++;
      continue;
    }

    validEventCount++;

    if (event.t < previousT) {
      sortedInput = false;
    }

    previousT = event.t;

    minT = Math.min(minT, event.t);
    maxT = Math.max(maxT, event.t);

    minX = Math.min(minX, event.x);
    maxX = Math.max(maxX, event.x);

    minY = Math.min(minY, event.y);
    maxY = Math.max(maxY, event.y);

    polarityValues.add(event.p);
    activePixels.add(`${event.x},${event.y}`);
    timestamps.push(event.t);

    if (event.p > 0) {
      positiveEventCount++;
    } else if (event.p < 0) {
      negativeEventCount++;
    } else {
      zeroPolarityCount++;
    }
  }

  const hasEvents = validEventCount > 0;

  const minTimestamp = hasEvents ? minT : null;
  const maxTimestamp = hasEvents ? maxT : null;

  const duration = hasEvents ? maxT - minT : null;

  const durationSeconds =
    duration === null
      ? null
      : timestampToSeconds(duration, timestampUnit);

  // Prefer verified sensor dimensions supplied by the caller.
  // Coordinate-derived dimensions are estimates, not sensor truth.
  const suppliedWidth =
    Number.isInteger(options.width) && options.width > 0
      ? options.width
      : null;

  const suppliedHeight =
    Number.isInteger(options.height) && options.height > 0
      ? options.height
      : null;

  const width =
    suppliedWidth ?? (hasEvents ? maxX + 1 : null);

  const height =
    suppliedHeight ?? (hasEvents ? maxY + 1 : null);

  const resolutionSource =
    suppliedWidth !== null && suppliedHeight !== null
      ? (options.resolutionSource || "provided")
      : "inferred_from_event_coordinates";

  const resolutionVerified =
    options.resolutionVerified === true;

  const sensorPixelCount =
    width !== null && height !== null
      ? width * height
      : null;

  const activePixelCount = activePixels.size;

  const coverage =
    sensorPixelCount > 0
      ? activePixelCount / sensorPixelCount
      : null;

  // Event rate requires a known timestamp unit and positive duration.
  const eventRate =
    durationSeconds > 0
      ? validEventCount / durationSeconds
      : null;

  const nonZeroPolarityCount =
    positiveEventCount + negativeEventCount;

  const positiveNegativeRatio = {
    positive:
      nonZeroPolarityCount > 0
        ? round(positiveEventCount / nonZeroPolarityCount)
        : null,

    negative:
      nonZeroPolarityCount > 0
        ? round(negativeEventCount / nonZeroPolarityCount)
        : null,

    positiveToNegative:
      negativeEventCount > 0
        ? round(positiveEventCount / negativeEventCount)
        : null
  };

  // Calculate timestamp gaps without spreading large arrays into Math.min/max.
  const sortedTimestamps = timestamps.slice().sort((a, b) => a - b);

  let gapSum = 0;
  let minGap = Infinity;
  let maxGap = -Infinity;
  let gapCount = 0;

  for (let i = 1; i < sortedTimestamps.length; i++) {
    const gap = sortedTimestamps[i] - sortedTimestamps[i - 1];

    gapSum += gap;
    minGap = Math.min(minGap, gap);
    maxGap = Math.max(maxGap, gap);
    gapCount++;
  }

  const eventDistribution = {
    eventsPerPolarity: {
      positive: positiveEventCount,
      negative: negativeEventCount,
      zero: zeroPolarityCount
    },

    timestampGap: gapCount > 0
      ? {
          mean: round(gapSum / gapCount),
          min: minGap,
          max: maxGap
        }
      : null
  };

  const warnings = [];

  if (timestampUnit === "unknown") {
    warnings.push(
      "Timestamp unit is unknown; event rate and duration in seconds are unavailable."
    );
  }

  if (!resolutionVerified) {
    warnings.push(
      "Sensor resolution is unverified; spatial coverage may use estimated dimensions."
    );
  }

  if (!sortedInput) {
    warnings.push(
      "Input events are not ordered by timestamp."
    );
  }

  if (invalidEventCount > 0) {
    warnings.push(
      "Invalid events were excluded from event-based calculations."
    );
  }

  return {
    eventModel: ["t", "x", "y", "p"],

    eventCount: events.length,
    validEventCount,
    invalidEventCount,

    sensor: {
      width,
      height,
      resolutionSource,
      resolutionVerified,

      coordinateBounds: hasEvents
        ? { minX, maxX, minY, maxY }
        : null,

      activePixelCount,
      sensorPixelCount,

      activePixelSparsity:
        coverage === null ? null : round(coverage),

      activePixelSparsityPercent:
        coverage === null ? null : round(coverage * 100, 4),

      coverageDenominator: resolutionVerified
        ? "verified_sensor_area"
        : "estimated_or_unverified_sensor_area"
    },

    timestamps: {
      unit: timestampUnit,

      unitStatus:
        timestampUnit === "unknown"
          ? "unverified"
          : "provided",

      minTimestamp,
      maxTimestamp,

      duration:
        duration === null ? null : round(duration),

      durationSeconds:
        durationSeconds === null
          ? null
          : round(durationSeconds),

      durationUs:
        timestampUnit === "microseconds" && duration !== null
          ? round(duration)
          : null,

      sortedInput,
      outOfOrderDetected: !sortedInput
    },

    polarity: {
      values: [...polarityValues].sort((a, b) => a - b),

      positiveEventCount,
      negativeEventCount,
      zeroPolarityCount,

      positiveNegativeRatio
    },

    analytics: {
      eventRatePerSecond:
        eventRate === null ? null : round(eventRate, 3),

      averageEventsPerSecond:
        eventRate === null ? null : round(eventRate, 3),

      spatialCoveragePercent:
        coverage === null ? null : round(coverage * 100, 4),

      eventDistribution
    },

    dataQuality: {
      status:
        invalidEventCount === 0
          ? "valid"
          : "invalid_events_detected",

      invalidEventCount,

      missingRowCount:
        Number.isInteger(options.missingRowCount)
          ? options.missingRowCount
          : null,

      skippedRowCount:
        Number.isInteger(options.skippedRowCount)
          ? options.skippedRowCount
          : null,

      warnings
    }
  };
}

export function buildPerformanceMetadata({
  timings = {},
  memory = {},
  outputFiles = {},
  transfer = {},
  recordingDurationSeconds = null
} = {}) {
  const getTiming = (key) =>
    isFiniteNumber(timings[key]) && timings[key] >= 0
      ? round(timings[key], 3)
      : null;

  const getFileSize = (key) =>
    isFiniteNumber(outputFiles[key]?.sizeBytes)
      ? outputFiles[key].sizeBytes
      : null;

  const totalMs = getTiming("totalIngestionMs");

  const processingSeconds =
    totalMs === null ? null : totalMs / 1000;

  const realTimeFactor =
    isFiniteNumber(recordingDurationSeconds) &&
    recordingDurationSeconds >= 0 &&
    processingSeconds > 0
      ? round(recordingDurationSeconds / processingSeconds, 6)
      : null;

  const peakBandwidth =
    isFiniteNumber(transfer.bytesTransferred) &&
    isFiniteNumber(transfer.durationSeconds) &&
    transfer.bytesTransferred >= 0 &&
    transfer.durationSeconds > 0
      ? round(
          transfer.bytesTransferred / transfer.durationSeconds,
          3
        )
      : null;

  return {
    parsingDurationMs: getTiming("parsingMs"),
    hdf5WritingDurationMs: getTiming("hdf5WritingMs"),
    parquetWritingDurationMs: getTiming("parquetWritingMs"),
    totalIngestionDurationMs: totalMs,

    eventsProcessedPerSecond:
      isFiniteNumber(timings.eventCount) &&
      processingSeconds > 0
        ? round(timings.eventCount / processingSeconds, 3)
        : null,

    peakMemoryBytes:
      isFiniteNumber(memory.peakBytes)
        ? memory.peakBytes
        : null,

    peakMemoryMB:
      isFiniteNumber(memory.peakBytes)
        ? round(memory.peakBytes / (1024 * 1024), 3)
        : null,

    inputFileSizeBytes: getFileSize("input"),
    hdf5OutputSizeBytes: getFileSize("hdf5"),
    parquetOutputSizeBytes: getFileSize("parquet"),

    outputValidationStatus:
      outputFiles.validationStatus ?? null,

    realTimeFactor,

    realTimeFactorStatus:
      realTimeFactor === null
        ? "unavailable_missing_valid_durations"
        : realTimeFactor > 1
          ? "faster_than_real_time"
          : "real_time_or_slower",

    peakBandwidthBytesPerSecond: peakBandwidth,

    peakBandwidthStatus:
      peakBandwidth === null
        ? "unavailable_missing_transfer_measurements"
        : "measured"
  };
}

export async function generateMetadata({
  filePath,
  originalFileName,
  fileSizeBytes,
  format,
  events,
  options = {},
  processingStatus = "success",
  processingDurationMs = null,
  timings = {},
  memory = {},
  outputFiles = {},
  transfer = {},
  validation = {}
} = {}) {
  const file = await buildFileMetadata({
    filePath,
    originalFileName,
    fileSizeBytes,
    format,
    processingStatus,
    processingDurationMs
  });

  const eventMetadata = extractEventMetadata(
    events || [],
    options
  );

  const performance = buildPerformanceMetadata({
    timings: {
      ...timings,
      eventCount: eventMetadata.validEventCount
    },
    memory,
    outputFiles,
    transfer,
    recordingDurationSeconds:
      eventMetadata.timestamps.durationSeconds
  });

  return {
    schemaVersion: METADATA_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),

    file,
    ...eventMetadata,
    performance,

    outputFiles: {
      hdf5: outputFiles.hdf5?.path ?? null,
      parquet: outputFiles.parquet?.path ?? null
    },

    validation: {
      status:
        validation.status ??
        (eventMetadata.dataQuality.status === "valid"
          ? "passed"
          : "failed"),

      message: validation.message ?? null,

      outputCorrectness:
        validation.outputCorrectness ??
        outputFiles.validationStatus ??
        null
    },

    integration: {
      source: "evaa-metadata",
      runtime: `node ${process.version}`,
      platform: os.platform()
    }
  };
}
