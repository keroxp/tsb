#!/usr/bin/env node
// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
import * as caporal from "caporal";
import { bundle } from "./bundle";

caporal
  .name("tsb")
  .version("0.2.2")
  .argument("file", "entry file path for bundle")
  .action(action);

async function action(args: { file: string }) {
  await bundle(args.file);
}

if (require.main) {
  caporal.parse(process.argv);
}
