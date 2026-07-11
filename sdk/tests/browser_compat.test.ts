import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * Regression pin for the M17-era browser bug: sdk/src used Node's
 * Buffer.writeBigUInt64LE / readBigUInt64LE, which do not exist on the Buffer
 * polyfill browser bundlers substitute — every deposit/withdraw built in the
 * dApp crashed with `TypeError: data.writeBigUInt64LE is not a function`
 * before the wallet was ever asked to sign. None of the Node-based test
 * environments (mocha here, vitest/jsdom in app/) could catch it, because
 * they all run against Node's real Buffer.
 *
 * The SDK must stay browser-portable: u64 encode/decode goes through
 * DataView (standard ES2020), never Node-only Buffer BigInt methods. This
 * test enforces that at the source level, the one place the constraint is
 * actually checkable without a real browser.
 */
describe("browser compatibility", () => {
  const srcDir = path.join(__dirname, "..", "src");

  it("sdk/src never uses Node-only Buffer BigInt methods", () => {
    const offenders: string[] = [];
    for (const file of fs.readdirSync(srcDir)) {
      if (!file.endsWith(".ts")) continue;
      const source = fs.readFileSync(path.join(srcDir, file), "utf-8");
      for (const [lineNo, line] of source.split("\n").entries()) {
        if (/\.\s*(read|write)Big(U)?Int64[BL]E\s*\(/.test(line)) {
          offenders.push(`${file}:${lineNo + 1}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, `Node-only Buffer BigInt methods found:\n${offenders.join("\n")}`).to.deep.equal(
      [],
    );
  });
});
