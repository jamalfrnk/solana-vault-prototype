pub mod deposit;
pub mod initialize;
pub mod migrate;
pub mod pause;
pub mod protocol;
pub mod rotate;
pub mod withdraw;

// Glob re-exports required by Anchor's #[program] macro-generated client code.
// The `handler` name collision is harmless — callers use module-qualified paths.
#[allow(ambiguous_glob_reexports)]
pub use deposit::*;
#[allow(ambiguous_glob_reexports)]
pub use initialize::*;
#[allow(ambiguous_glob_reexports)]
pub use migrate::*;
#[allow(ambiguous_glob_reexports)]
pub use pause::*;
#[allow(ambiguous_glob_reexports)]
pub use protocol::*;
#[allow(ambiguous_glob_reexports)]
pub use rotate::*;
#[allow(ambiguous_glob_reexports)]
pub use withdraw::*;
