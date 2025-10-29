import { reactRouter } from "@react-router/dev/vite";
import { vercelPreset } from "@vercel/react-router/vite";  // ADD THIS
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

// ... rest of your config ...

export default defineConfig({
  server: {
    // ... your server config ...
  },
  plugins: [
    reactRouter({
      presets: [vercelPreset()],  // ADD THIS
    }), 
    tsconfigPaths()
  ],
  // ... rest of your config ...
});