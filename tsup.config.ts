import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/lib.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
