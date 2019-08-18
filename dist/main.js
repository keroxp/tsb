#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
const caporal = require("caporal");
const bundle_1 = require("./bundle");
caporal
    .name("tsb")
    .version("0.5.3")
    .argument("file", "entry file path for bundle")
    .option("--skipFetch", "skip fetching remote module recursively")
    .action(action);
async function action(args, opts) {
    try {
        await bundle_1.bundle(args.file, opts);
    }
    catch (e) {
        if (e instanceof Error) {
            console.error(e.stack);
        }
    }
}
if (require.main) {
    caporal.parse(process.argv);
}
