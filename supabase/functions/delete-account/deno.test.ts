// Deno, which runs the function in Supabase, takes supabase-js from deno.json; TypeScript and
// the tests check it against the one in node_modules. Both must be the same version.
import lock from "../../../package-lock.json";

import deno from "./deno.json";

test("deploys the version of supabase-js that the project checks", () => {
  const installed = lock.packages["node_modules/@supabase/supabase-js"].version;

  expect(deno.imports["@supabase/supabase-js"]).toBe(
    `npm:@supabase/supabase-js@${installed}`,
  );
});
