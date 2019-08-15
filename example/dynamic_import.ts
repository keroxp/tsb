async function func() {
  import("./other.ts").then(async other => {
    console.log(other.callNever());
    const color = await import("https://deno.land/std@v0.15.0/colors/mod.ts");
    console.log(color);
  });
}
func();
