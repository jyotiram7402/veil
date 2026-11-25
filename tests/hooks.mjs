import { registerHooks } from "node:module";

const fakes = {
  "server-only": new URL("./fakes/server-only.mjs", import.meta.url).href,
  "@/lib/supabase/admin": new URL("./fakes/supabase-admin.mjs", import.meta.url).href,
  "@/lib/env": new URL("./fakes/env.mjs", import.meta.url).href,
};
const src = new URL("../src/", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (fakes[specifier]) return { url: fakes[specifier], shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(src + specifier.slice(2) + ".ts", context);
    return nextResolve(specifier, context);
  },
});
