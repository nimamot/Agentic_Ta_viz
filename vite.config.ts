import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localDataApiPlugin } from "./vite/localDataApiPlugin";

export default defineConfig({
  plugins: [react(), localDataApiPlugin()],
});
