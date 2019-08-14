# tsb
TypeScript module bundler for Deno

# Usage

```bash
$ deno fetch https://deno.land/std/http/server.ts
$ ts-node src/main.ts https://deno.land/std/http/server.ts > bundle.js
$ deno -A file_server_bundle.js
```