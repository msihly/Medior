import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "./toast";

export const useCancellableLoad = () => {
  const [isLoading, setIsLoading] = useState(false);

  const controller = useRef<AbortController>(null);
  const mounted = useRef(true);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;

    if (mounted.current) setIsLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const run = async (load: (signal: AbortSignal) => Promise<void>) => {
    if (!mounted.current) return;

    controller.current?.abort();

    const request = new AbortController();

    controller.current = request;
    setIsLoading(true);

    try {
      await load(request.signal);
    } catch (error) {
      if (!request.signal.aborted) toast.error(error);
    } finally {
      if (controller.current === request && !request.signal.aborted) {
        controller.current = null;
        setIsLoading(false);
      }
    }
  };

  return { cancel, isLoading, run };
};
