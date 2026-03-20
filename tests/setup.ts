// Suppress unhandled rejections in tests. The Deferred class intentionally
// rethrows errors from its constructor's catch handler for root-level deferreds,
// which creates expected unhandled rejections during error propagation tests.
process.on("unhandledRejection", () => {});
