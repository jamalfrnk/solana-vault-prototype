import { createHash } from "crypto";

/**
 * Anchor's instruction discriminator: sha256("global:<snake_case_name>")[0..8].
 * Computed here (not read from an IDL) so the SDK has no runtime IDL dependency.
 */
export function instructionDiscriminator(snakeCaseName: string): Buffer {
  return createHash("sha256")
    .update(`global:${snakeCaseName}`)
    .digest()
    .subarray(0, 8);
}

/**
 * Anchor's account discriminator: sha256("account:<PascalCaseName>")[0..8].
 */
export function accountDiscriminator(pascalCaseName: string): Buffer {
  return createHash("sha256")
    .update(`account:${pascalCaseName}`)
    .digest()
    .subarray(0, 8);
}

/** Anchor's event discriminator: sha256("event:<PascalCaseName>")[0..8]. */
export function eventDiscriminator(pascalCaseName: string): Buffer {
  return createHash("sha256")
    .update(`event:${pascalCaseName}`)
    .digest()
    .subarray(0, 8);
}
