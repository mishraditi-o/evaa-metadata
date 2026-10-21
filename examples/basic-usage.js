
import { generateMetadata } from "../../index.js";

const events = [
  { t: 1000, x: 0, y: 0, p: 1 },
  { t: 1500, x: 2, y: 1, p: -1 },
  { t: 2500, x: 2, y: 1, p: 1 }
];

const metadata = await generateMetadata({
  originalFileName: "sample.csv",
  fileSizeBytes: 128,
  events,

  options: {
    timestampUnit: "microseconds",

    width: 640,
    height: 480,

    resolutionSource: "provided_verified",
    resolutionVerified: true,

    skippedRowCount: 0,
    missingRowCount: 0
  },

  processingStatus: "success",
  processingDurationMs: 12.4,

  timings: {
    parsingMs: 4.1,
    hdf5WritingMs: 3.2,
    parquetWritingMs: 2.8,
    totalIngestionMs: 12.4
  },

  memory: {
    peakBytes: process.memoryUsage().rss
  },

  outputFiles: {
    input: {
      sizeBytes: 128
    },

    hdf5: {
      path: "./output/events.h5",
      sizeBytes: 2048
    },

    parquet: {
      path: "./output/data.parquet",
      sizeBytes: 1024
    },

    validationStatus: "passed"
  },

  validation: {
    status: "passed",
    outputCorrectness: true
  }
});

console.log(JSON.stringify(metadata, null, 2));
