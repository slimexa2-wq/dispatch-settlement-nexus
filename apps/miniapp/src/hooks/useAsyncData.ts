import { useCallback, useEffect, useState, type DependencyList } from "react";

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useAsyncData<T>(loader: () => Promise<T>, dependencies: DependencyList = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
