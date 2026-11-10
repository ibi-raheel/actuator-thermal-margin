import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from a sub-path of ibiraheel.com. Assets and data fetches use
// import.meta.env.BASE_URL, so this is the only place the path is set.
// Override with VITE_BASE=/ for root hosting.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/demos/actuator-thermal-margin/",
  plugins: [react()],
});
