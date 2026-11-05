import { useCallback, useEffect, useRef, useState } from "react";

export type ApiResource<T> = {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  reload: () => Promise<T | undefined>;
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
};

export function useApiResource<T>(loader: () => Promise<T>, deps: readonly unknown[]): ApiResource<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const callIdRef = useRef(0);

  const reload = useCallback(async () => {
    const callId = ++callIdRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const next = await loader();
      if (callId === callIdRef.current) setData(next);
      return next;
    } catch (nextError) {
      if (callId === callIdRef.current) setError(nextError);
      return undefined;
    } finally {
      if (callId === callIdRef.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
    return () => {
      callIdRef.current += 1;
    };
  }, [reload]);

  return { data, loading, error, reload, setData };
}
