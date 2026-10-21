
export const METADATA_SCHEMA_VERSION = "1.0.0";

export const SUPPORTED_FORMATS = new Set([
  "txt",
  "csv",
  "npy",
  "mat",
  "h5",
  "hdf5"
]);

// Number of timestamp units in one second.
export const TIMESTAMP_UNITS_PER_SECOND = Object.freeze({
  seconds: 1,
  milliseconds: 1_000,
  microseconds: 1_000_000,
  nanoseconds: 1_000_000_000
});
