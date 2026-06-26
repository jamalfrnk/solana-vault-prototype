pub mod deposit;
pub mod initialize;

// Glob re-exports required by Anchor's #[program] macro-generated client code.
// The `handler` name collision is harmless — callers use module-qualified paths.
#[allow(ambiguous_glob_reexports)]
pub use deposit::*;
#[allow(ambiguous_glob_reexports)]
pub use initialize::*;
