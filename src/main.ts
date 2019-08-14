// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
import { bundle } from "./bundle";

async function action() {
  const entry = process.argv[process.argv.length - 1];
  if (!entry) {
    console.error("file path not provided");
    process.exit(1);
  }
  await bundle(entry);
}

action();
