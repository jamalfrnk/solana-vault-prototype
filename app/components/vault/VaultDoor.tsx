/**
 * The CSS-drawn vault door, modeled on the reference photo (M17): a square
 * gunmetal slab hinged on the LEFT, dome rivets around the frame edge and
 * around the raised circular ring, a black numbered combination dial above
 * an eight-armed ship's-wheel handle, and the lock-status LED.
 *
 * Animation roles: the DIAL spins the 3-right / 2-left / 1-right code during
 * `unlocking`, then the wheel (handle) turns to withdraw the bolts, then the
 * whole slab swings right-to-left on the hinges.
 */

const RING_RIVET_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);
const WHEEL_ROD_ANGLES = [0, 45, 90, 135];

/** Frame-edge rivets: percentage positions along the door's square border. */
import { OperationalState } from "@vault-sdk";

const EDGE_RIVETS: Array<{ top: string; left: string }> = [
  // top edge
  { top: "2.5%", left: "14%" },
  { top: "2.5%", left: "38%" },
  { top: "2.5%", left: "62%" },
  { top: "2.5%", left: "86%" },
  // bottom edge
  { top: "94.5%", left: "14%" },
  { top: "94.5%", left: "38%" },
  { top: "94.5%", left: "62%" },
  { top: "94.5%", left: "86%" },
  // left edge
  { top: "26%", left: "2.5%" },
  { top: "50%", left: "2.5%" },
  { top: "74%", left: "2.5%" },
  // right edge
  { top: "26%", left: "94.5%" },
  { top: "50%", left: "94.5%" },
  { top: "74%", left: "94.5%" },
];

export function VaultDoor({
  operationalState,
}: {
  operationalState: OperationalState;
}) {
  return (
    <div className="vault-door" data-testid="vault-door">
      {EDGE_RIVETS.map((pos, i) => (
        <span key={i} className="vault-rivet vault-rivet-edge" style={pos} />
      ))}

      <div className="vault-door-ring">
        {RING_RIVET_ANGLES.map((angle) => (
          <span
            key={angle}
            className="vault-rivet-ring-slot"
            style={{ transform: `rotate(${angle}deg)` }}
          />
        ))}

        <div className="vault-door-disc">
          <span
            className="vault-led"
            data-operational-state={OperationalState[operationalState]}
          />

          <div className="vault-dial" data-testid="vault-dial">
            <div className="vault-dial-face">
              <span className="vault-dial-knob" />
            </div>
          </div>

          <div className="vault-wheel" data-testid="vault-wheel">
            {WHEEL_ROD_ANGLES.map((angle) => (
              <span
                key={angle}
                className="vault-wheel-rod"
                style={{ transform: `rotate(${angle}deg)` }}
              />
            ))}
            <span className="vault-wheel-hub" />
          </div>

          <span className="vault-door-knob" />
        </div>
      </div>
    </div>
  );
}
