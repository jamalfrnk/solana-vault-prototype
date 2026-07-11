const BOLT_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const SPOKE_ANGLES = [0, 60, 120];

/** The CSS-drawn circular vault door: rim bolts, three-spoke wheel, lock LED. */
export function VaultDoor({ isPaused }: { isPaused: boolean }) {
  return (
    <div className="vault-door" data-testid="vault-door">
      {BOLT_ANGLES.map((angle) => (
        <span
          key={angle}
          className="vault-bolt"
          style={{ transform: `rotate(${angle}deg)` }}
        />
      ))}
      <span className="vault-led" data-paused={isPaused ? "true" : "false"} />
      <div className="vault-wheel">
        {SPOKE_ANGLES.map((angle) => (
          <span
            key={angle}
            className="vault-spoke"
            style={{ transform: `rotate(${angle}deg)` }}
          />
        ))}
      </div>
    </div>
  );
}
