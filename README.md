tsb
===
TypeScript module bundler for Deno

## Description

`tsb` is module bundler for Deno. It bundles TypeScript modules built with pure ESModule.

## Usage

```bash
$ deno fetch ./example/server.ts
$ ts-node src/main.ts ./example/server.ts > bundle.js
$ deno -A bundle.js
```

## License

MIT