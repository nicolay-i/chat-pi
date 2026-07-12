import { comparer, reaction } from 'mobx';
import { useEffect, useRef, useState } from 'react';

export function useMobxSnapshot<T>(selector: () => T): T {
  const selectorRef = useRef(selector);
  const [snapshot, setSnapshot] = useState<T>(() => selector());

  useEffect(() => {
    selectorRef.current = selector;
  }, [selector]);

  useEffect(() => {
    return reaction(
      () => selectorRef.current(),
      (next) => {
        setSnapshot((current) => comparer.structural(current, next) ? current : next);
      },
      { equals: comparer.structural },
    );
  }, []);

  return snapshot;
}
