#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright 2019 Yusuke Sakurai. All rights reserved. MIT license.
const caporal = require("caporal");
const bundle_1 = require("./bundle");
caporal
    .name("tsb")
    .version("0.1.0")
    .argument("file", "entry file path for bundle")
    .action(action);
function action(args) {
    return __awaiter(this, void 0, void 0, function* () {
        yield bundle_1.bundle(args.file);
    });
}
if (require.main) {
    caporal.parse(process.argv);
}
