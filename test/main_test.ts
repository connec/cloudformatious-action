import { assert } from "./deps.ts"
import { add } from "../src/main.ts"

const { assertEquals } = assert

Deno.test(function addTest(): void {
  assertEquals(add(2, 3), 5)
})
