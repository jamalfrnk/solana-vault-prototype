pub const VAULT_SEED: &[u8] = b"vault";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault_authority";
pub const USER_POSITION_SEED: &[u8] = b"user_position";
pub const PROTOCOL_CONFIG_SEED: &[u8] = b"protocol_config";
pub const MINT_CONFIG_SEED: &[u8] = b"mint_config";

/// ADR 0007 ordinary configuration delay: exactly 48 hours.
pub const MINT_CONFIG_UPDATE_DELAY_SECONDS: i64 = 48 * 60 * 60;
