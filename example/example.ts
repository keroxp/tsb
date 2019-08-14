import {serve} from "https://deno.land/std@v0.12.0/http.ts"
import some from "./some.ts"
import {callOther, callNever as callAnother} from "./other.ts"
import * as aa from "aa";

export default {a: 1}
export const f = 2;
export function func() {}
export * from "./some.ts";
export {a, b, c as CC} from "./hoge.ts"
export class SomeClass {}