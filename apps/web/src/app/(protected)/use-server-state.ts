"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Keeps an editable client-side view synchronized when a Server Component
 * refresh supplies a newer authoritative value.
 */
export function useServerState<T>(
  serverValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(serverValue);

  useEffect(() => {
    setValue(serverValue);
  }, [serverValue]);

  return [value, setValue];
}
