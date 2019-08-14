import { listenAndServe } from "https://denopkg.com/keroxp/servest@v0.9.0/server.ts";
listenAndServe(":8899", async req => {
  await req.respond({
    status: 200,
    headers: new Headers({
      "Content-Type": "text/plain"
    }),
    body: new TextEncoder().encode("hello")
  });
});
console.log("server is running on :8899...");
