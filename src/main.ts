#!/usr/bin/env node
// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
import * as caporal from "caporal";
import { bundle } from "./bundle";

caporal
  .name("tsb")
  .version("0.5.1")
  .argument("file", "entry file path for bundle")
  .option("--skipFetch", "skip fetching remote module recursively")
  .action(action);

export type CliOptions = {
  skipFetch: boolean;
};

async function action(args: { file: string }, opts: CliOptions) {
  try {
    await bundle(args.file, opts);
  } catch (e) {
    if (e instanceof Error) {
      console.error(e.stack);
    }
  }
}

if (require.main) {
  caporal.parse(process.argv);
}
