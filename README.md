[![npm version](https://badge.fury.io/js/%40keroxp%2Ftsb.svg)](https://badge.fury.io/js/%40keroxp%2Ftsb)

tsb
===
TypeScript/JavaScript module bundler for ESModule 

## Description

`tsb` is module bundler for ECMAScript. It bundles TypeScript/JavaScript modules built with pure ESModule.

## Concept

- **TypeScript first**
  - tsb bundles and transpiles ts/js files with TypeScript Compiler API
- **ESM only**
  - tsb only supports ECMAScript that are written with pure ESModule (import/export)
  - CommonJS,AMD (require/exports) are **NOT supported**
- **URL import support**
  - tsb will automatically fetch URL import/export and bundles all dependencies and stores caches.

## Install
Via yarn

```bash
$ yarn global add @keroxp/tsb
```

Via npm

```bash
$ npm i -g @keroxp/tsb
```

or 

```bash
$ npx @keroxp/tsb
```
## Usage

```bash
$ tsb ./example/server.ts > bundle.js
```

## License

MIT