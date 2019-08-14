import * as path from "path";
import { bundle } from "./bundle";

async function action() {
  const target = process.argv[process.argv.length - 1];
  if (!target) {
    console.error("file path not provided");
    process.exit(1);
  }
  const entry = path.resolve(target);
  await bundle(entry);
}

action();
