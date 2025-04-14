import { expect, test } from "@jest/globals";
import { Clip1 } from "../src/Conventions";

test("clip1", () => {
  const BitDepth = 8;
  [212, 211, 211, 211, 210, 209, 209, 208].forEach((v, i) => {
    const v2 = Clip1(v, BitDepth);
    expect(v2).toBe(v);
  });
});
