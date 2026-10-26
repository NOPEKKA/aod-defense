import type { EventBus, GameEventName, GameEvents, Unsubscribe } from '../contracts';

type Handler = (payload: never) => void;

/** Typed synchronous pub/sub. Handlers run in subscription order. */
export function createEventBus(): EventBus {
  const handlers = new Map<GameEventName, Set<Handler>>();

  const on = <K extends GameEventName>(event: K, fn: (payload: GameEvents[K]) => void): Unsubscribe => {
    let set = handlers.get(event);
    if (!set) {
      set = new Set();
      handlers.set(event, set);
    }
    set.add(fn as Handler);
    return () => {
      set.delete(fn as Handler);
    };
  };

  return {
    on,
    once(event, fn) {
      const off = on(event, (payload) => {
        off();
        fn(payload);
      });
      return off;
    },
    emit(event, payload) {
      const set = handlers.get(event);
      if (!set) return;
      for (const fn of [...set]) (fn as (p: typeof payload) => void)(payload);
    },
    clear() {
      handlers.clear();
    },
  };
}
