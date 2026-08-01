import { describe, it, expect } from "vitest";

import { parseTokenAmount, formatTokenAmount } from "../../lib/solana/amounts";

describe("parseTokenAmount", () => {
  it("scales whole tokens by decimals", () => {
    expect(parseTokenAmount("100", 6)).to.deep.equal({
      baseUnits: 100_000_000n,
      problem: null,
    });
  });

  it("scales fractional tokens by decimals", () => {
    expect(parseTokenAmount("1.5", 6).baseUnits).to.equal(1_500_000n);
    expect(parseTokenAmount("0.000001", 6).baseUnits).to.equal(1n);
  });

  it("passes raw integers through on a zero-decimals mint", () => {
    expect(parseTokenAmount("42", 0).baseUnits).to.equal(42n);
  });

  it("rejects empty input", () => {
    expect(parseTokenAmount("", 6).problem).to.match(/enter an amount/i);
  });

  it("rejects non-numeric input", () => {
    expect(parseTokenAmount("abc", 6).problem).to.match(/positive number/i);
    expect(parseTokenAmount("-5", 6).problem).to.match(/positive number/i);
    expect(parseTokenAmount("1.2.3", 6).problem).to.match(/positive number/i);
  });

  it("rejects more fractional digits than the mint supports", () => {
    expect(parseTokenAmount("1.1234567", 6).problem).to.match(
      /too many decimal places/i,
    );
    expect(parseTokenAmount("1.5", 0).problem).to.match(
      /too many decimal places/i,
    );
  });

  it("rejects zero", () => {
    expect(parseTokenAmount("0", 6).problem).to.match(/greater than zero/i);
    expect(parseTokenAmount("0.000000", 6).problem).to.match(
      /greater than zero/i,
    );
  });
});

describe("formatTokenAmount", () => {
  it("formats whole amounts without a decimal point", () => {
    expect(formatTokenAmount(100_000_000n, 6)).to.equal("100");
  });

  it("trims trailing zeros from fractions", () => {
    expect(formatTokenAmount(1_500_000n, 6)).to.equal("1.5");
    expect(formatTokenAmount(1n, 6)).to.equal("0.000001");
  });

  it("is the inverse of parseTokenAmount", () => {
    const { baseUnits } = parseTokenAmount("123.456789", 6);
    expect(formatTokenAmount(baseUnits, 6)).to.equal("123.456789");
  });

  it("handles zero decimals as raw units", () => {
    expect(formatTokenAmount(12_345n, 0)).to.equal("12345");
  });
});
