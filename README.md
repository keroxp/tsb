tsb
===
TypeScript module bundler for Deno

## Description

`tsb` is module bundler for Deno. It bundles TypeScript modules built with pure ESModule.

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