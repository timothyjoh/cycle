import { getVersion } from "./version.ts";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log(await getVersion());
  process.exit(0);
}
console.error("cycle: no command yet (MVP scaffold)");
process.exit(2);
