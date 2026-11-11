import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

// esptool-js loads its flasher stubs with import(..., { with: { type: "json" } }).
// Vite leaves those imports unbundled, so the stubs 404 in production. Drop the
// attribute and let Vite bundle them as ordinary JSON modules.
const esptoolStubs: Plugin = {
  name: "esptool-js-stubs",
  transform(code, id) {
    if (!/esptool-js[\\/]lib[\\/]stubFlasher\.js$/.test(id)) return null;
    return code.replace(/,\s*\{\s*with:\s*\{\s*type:\s*"json"\s*\}\s*\}/g, "");
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), esptoolStubs],
  server: {
    allowedHosts: ["rei.infra.petril.li"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
