import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

// Vitest runs the engine and component tests without the React Router build plugin.
export default defineConfig({ plugins: [!process.env.VITEST && reactRouter()] });
