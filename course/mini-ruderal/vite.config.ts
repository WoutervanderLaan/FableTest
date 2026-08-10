import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Matches the real Ruderal client config. `worker.format: "es"` lets us write
// the mesher web worker (Part 2 deep-dive) as a normal ES module.
export default defineConfig({
  plugins: [react()],
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
});
