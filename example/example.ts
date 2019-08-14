// import { serve } from "https://deno.land/std@v0.12.0/http/server.ts";
import { cyan } from "https://deno.land/std@v0.12.0/colors/mod.ts";
import some from "./some.ts";
import { callOther, callNever as callAnother, callNever } from "./other.ts";
import * as hoge from "./hoge.ts";

export default { a: 1 };
export const f = 2;
export function func() {}
export * from "./some.ts";
export { a, b, c as CC } from "./hoge.ts";
export class SomeClass {}
export enum Fuga {
  a = 1
}
enum Hoge {
  h = 1,
  v = 2
}
export { Hoge };

console.log(cyan(callOther() + ":" + callNever()));
