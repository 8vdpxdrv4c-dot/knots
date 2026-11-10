import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { APP_BASE } from "./src/app/shared/base";

// Vitest runs the engine and component tests without the React Router build plugin.
// The published site is a subpath of 3dfans; unit tests keep the default `/` base.
export default defineConfig({
  base: process.env.VITEST ? "/" : APP_BASE,
  plugins: [!process.env.VITEST && reactRouter()],
});
