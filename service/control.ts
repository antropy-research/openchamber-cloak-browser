// Who works in the browser: nobody, the agent, or the user in one window. OpenChamber decided this for the picture it
// drew (its shared surface); the page in the panel is the extension's own, so the service does, the same way:
//
// - The agent holds control for AGENT_HOLD_MS after each of its actions (SURFACE_AGENT_HOLD_MS in OpenChamber).
// - The user takes control by acting in the page: a click, the wheel, a key, text. Moving the pointer is looking,
//   not acting, and goes to the page only while that window holds control. The agent's actions are refused while
//   the user holds it, with OpenChamber's own words, so the agent waits or asks.
// - The user holds it until they hand it back (the strip's button), stop for USER_IDLE_MS (OpenChamber has no such
//   end; here a click made long ago does not keep the agent out), or close the window (its panel stops asking).
// - Another window sees who holds control and cannot take it.
export type Controller = 'none' | 'agent' | 'user';
/** `agentSeen`: the agent acted, or tried to, lately; without it, who holds control does not matter to anyone. */
export type ControlState = { controller: Controller; mine: boolean; agentSeen: boolean };

const AGENT_HOLD_MS = 30_000;
const USER_IDLE_MS = 60_000;
const AGENT_SEEN_MS = 10 * 60_000;
/** A window whose panel has not asked for this long is gone. */
const VIEWER_GONE_MS = 20_000;

/** What the agent hears while the user holds control: OpenChamber's own message for its surface. */
export const USER_HAS_CONTROL = 'The user is interacting with this page in the panel right now, so the action was not run. '
  + 'Wait for them to hand control back, or ask them to. Nothing was changed.';

export class Control {
  private controller: Controller = 'none';
  private viewer: string | null = null;
  private agentUntil = 0;
  /** When the agent last acted or tried to: the strip says who holds control only with an agent around. */
  private agentAt = 0;
  private userAt = 0;
  private readonly seen = new Map<string, number>();

  constructor(private readonly changed: () => void = () => {}) {}

  /** A window's panel asked for something: it is still open. */
  see(viewer: string): void {
    if (viewer) this.seen.set(viewer, Date.now());
  }

  state(viewer: string): ControlState {
    this.settle();
    return { controller: this.controller, mine: this.controller === 'user' && this.viewer === viewer, agentSeen: Date.now() - this.agentAt < AGENT_SEEN_MS };
  }

  /** The user acts in `viewer`'s window: whether it holds control now (false: another window does). */
  userActs(viewer: string): boolean {
    this.settle();
    if (!viewer || (this.controller === 'user' && this.viewer !== viewer)) return false;
    const was = this.controller;
    this.controller = 'user';
    this.viewer = viewer;
    this.userAt = Date.now();
    this.see(viewer);
    if (was !== 'user') this.changed();
    return true;
  }

  /** The user's pointer moves in `viewer`'s window: it goes to the page only while that window holds control. */
  userLooks(viewer: string): boolean {
    this.settle();
    return this.controller === 'user' && this.viewer === viewer;
  }

  /** The strip's "Hand back to agent". */
  release(viewer: string): void {
    this.settle();
    if (this.controller !== 'user' || this.viewer !== viewer) return;
    this.controller = 'none';
    this.viewer = null;
    this.changed();
  }

  /** The agent is about to act: false while the user holds control (the action is refused). */
  agentActs(): boolean {
    this.settle();
    this.agentAt = Date.now();
    if (this.controller === 'user') return false;
    const was = this.controller;
    this.controller = 'agent';
    this.agentUntil = Date.now() + AGENT_HOLD_MS;
    if (was !== 'agent') this.changed();
    return true;
  }

  private settle(): void {
    const now = Date.now();
    if (this.controller === 'user') {
      const seen = this.seen.get(this.viewer ?? '') ?? 0;
      if (now - this.userAt > USER_IDLE_MS || now - seen > VIEWER_GONE_MS) {
        this.controller = 'none';
        this.viewer = null;
        this.changed();
      }
    } else if (this.controller === 'agent' && now > this.agentUntil) {
      this.controller = 'none';
      this.changed();
    }
    for (const [viewer, at] of this.seen) if (now - at > VIEWER_GONE_MS * 3) this.seen.delete(viewer);
  }
}
