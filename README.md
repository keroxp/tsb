tsb
===
TypeScript/JavaScript module bundler for ESModule 

## Description

`tsb` is module bundler for ECMAScript. It bundles TypeScript/JavaScript modules built with pure ESModule.

## Concept

- TypeScript first
  - tsb bundles and compiles ts/js with TypeScript Compiler API
- ESM only
  - tsb only supports ECMAScript that is written with pure ESModule (import/export)
  - CommonJS,AMD (require/exports) are not supported
- URL import support
  - tsb will automatically fetch URL import/export and bundles all dependencies.
    

## Install

Via npm

```bash
$ npm i -g @kerpxp/tsb
```

or 

```bash
$ npx @keroxp/tsb
```
## Usage

```bash
$ deno fetch ./example/server.ts
$ tsb ./example/server.ts > bundle.js
$ deno -A bundle.js
```

## License

MIT