// A Chrome DevTools Protocol client over the browser's WebSocket (Node's own WebSocket), with flat sessions: a
// command for a tab carries that tab's `sessionId`, and so does every event the tab sends.

export type CdpEvent = { method: string; params: Record<string, unknown>; sessionId?: string };

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(event: CdpEvent) => void>();
  private closedWith: Error | null = null;
  private readonly closeListeners = new Set<(error: Error) => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => this.receive(String(event.data)));
    socket.addEventListener('close', () => this.fail(new Error('The browser closed its DevTools connection.')));
    socket.addEventListener('error', () => this.fail(new Error('The browser\'s DevTools connection failed.')));
  }

  static connect(url: string, timeoutMs = 10_000): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`No DevTools connection to the browser within ${timeoutMs} ms.`));
      }, timeoutMs);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(new Cdp(socket));
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Could not open the browser\'s DevTools connection.'));
      }, { once: true });
    });
  }

  get closed(): boolean {
    return this.closedWith !== null;
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 30_000): Promise<T> {
    if (this.closedWith) return Promise.reject(this.closedWith);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} got no answer within ${timeoutMs} ms.`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  /** Every event, from the browser and from every attached tab; returns the unsubscribe. */
  on(listener: (event: CdpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onClose(listener: (error: Error) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close(): void {
    this.socket.close();
  }

  private receive(text: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string; code?: number }; method?: string; params?: Record<string, unknown>; sessionId?: string };
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${message.error.message ?? 'CDP error'} (${message.error.code ?? '?'})`));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (typeof message.method !== 'string') return;
    const event: CdpEvent = { method: message.method, params: message.params ?? {}, sessionId: message.sessionId };
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('[cloak-browser] a CDP event listener failed:', error);
      }
    }
  }

  private fail(error: Error): void {
    if (this.closedWith) return;
    this.closedWith = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const listener of [...this.closeListeners]) listener(error);
  }
}
