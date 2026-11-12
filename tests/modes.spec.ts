import { expect, test } from "@playwright/test";
import { MODE_NAMES, pickOther, pickOtherMode } from "../visual-systems";

// Pure-function tests (no browser): the mode chip's "random other mode" logic.

test("pickOther never returns the current item and covers every other item", () => {
  const all = ["a", "b", "c", "d"];

  // pickOther takes an optional `rand` argument: a function returning a number in [0, 1), which
  // defaults to Math.random. We inject our own deterministic function in its place so this test
  // can't be flaky. Stepping the injected value from 0 up to (but not including) 1 stands in for
  // "every possible random draw". The step count only needs to be well above the number of
  // candidates (3 here), so that each candidate's share of [0, 1) is hit several times; 30 gives
  // about ten hits per candidate.
  const steps = 30;
  const seen = new Set<string>();
  for (let i = 0; i < steps; i++) seen.add(pickOther(all, "b", () => i / steps)!);

  expect([...seen].sort()).toEqual(["a", "c", "d"]);
});

test("pickOther maps its `rand` argument onto the remaining items in order", () => {
  const all = ["a", "b", "c"];
  expect(pickOther(all, "a", () => 0)).toBe("b");
  expect(pickOther(all, "a", () => 0.99)).toBe("c");
  expect(pickOther(all, "c", () => 0)).toBe("a");
});

test("pickOther rejects a `rand` argument that returns a value outside [0, 1)", () => {
  for (const bad of [1, 1.5, -0.1, -1, NaN, Infinity]) {
    expect(() => pickOther(["a", "b"], "a", () => bad), String(bad)).toThrow(RangeError);
  }
  expect(() => pickOther(["a", "b"], "a", () => 1)).toThrow(/\[0, 1\), but returned 1/);
  // The endpoints of the valid range are accepted: 0 is in range, and the largest double below 1 is too.
  expect(pickOther(["a", "b"], "a", () => 0)).toBe("b");
  expect(pickOther(["a", "b", "c"], "a", () => 1 - Number.EPSILON)).toBe("c");
});

test("pickOther does not call `rand` when there is nothing to pick", () => {
  const rand = () => {
    throw new Error("rand should not be called");
  };
  expect(pickOther(["only"], "only", rand)).toBeUndefined();
});

test("pickOther returns undefined when there is nothing else to pick", () => {
  expect(pickOther(["only"], "only")).toBeUndefined();
  expect(pickOther([], "x")).toBeUndefined();
});

test("pickOtherMode picks from the real mode registry", () => {
  for (const mode of MODE_NAMES) {
    const next = pickOtherMode(mode);
    expect(next).toBeDefined();
    expect(next).not.toBe(mode);
    expect(MODE_NAMES).toContain(next);
  }
});
