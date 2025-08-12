import { getCurrentWebContents } from "@electron/remote";
import {
  DependencyList,
  EffectCallback,
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isObservable } from "mobx";
import { getSnapshot } from "mobx-keystone";
import { File, useStores } from "medior/store";
import { toast } from "medior/utils/client/toast";
import { isDeepEqual } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export const useDeepEffect = (cb: EffectCallback, deps: DependencyList) =>
  useEffect(cb, [
    ...deps.map((dep) => {
      try {
        return isObservable(dep) ? getSnapshot(dep) : useDeepMemo(dep);
      } catch (err) {
        return JSON.stringify(dep);
      }
    }),
  ]);

export const useDeepMemo = <T>(value: T) => {
  const valueRef = useRef<T>(value);
  const depRef = useRef<number>(0);

  let compareValue: any;
  let compareValueRef: any;

  try {
    compareValue = isObservable(value) ? getSnapshot(value) : value;
    compareValueRef = isObservable(valueRef.current)
      ? getSnapshot(valueRef.current)
      : valueRef.current;
  } catch (err) {
    compareValue = JSON.stringify(value);
    compareValueRef = JSON.stringify(valueRef.current);
  }

  if (!isDeepEqual(compareValue, compareValueRef)) {
    valueRef.current = value;
    depRef.current += 1;
  }

  return useMemo(() => valueRef.current, [depRef.current]);
};

export const useElementResize = (ref: MutableRefObject<any>, condition?: any) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [absPosition, setAbsPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const nodeRef = ref?.current;

    const getDimensions = () => ({
      width: nodeRef?.offsetWidth || 0,
      height: nodeRef?.offsetHeight || 0,
    });

    const getPosition = () => {
      const rect = nodeRef?.getBoundingClientRect?.();
      return { top: rect?.top || 0, left: rect?.left || 0 };
    };

    const handleResize = () => {
      setDimensions(getDimensions());
      setAbsPosition(getPosition());
    };

    if (nodeRef) handleResize();

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, [ref, condition]);

  return { ...dimensions, ...absPosition };
};

export const useFileDrag = (file: File, selectedIds: string[]) => {
  const stores = useStores();

  const loadSelectedFiles = async () => {
    const res = await trpc.listFile.mutate({ args: { filter: { id: selectedIds } } });
    if (!res?.success) throw new Error(res.error);
    return res.data.items;
  };

  const onDragEnd = () => stores.home.setIsDraggingOut(false);

  const onDragStart = async (event: React.DragEvent) => {
    event.preventDefault();
    stores.home.setIsDraggingOut(true);

    const hasSelected = selectedIds.includes(file.id);
    const files = hasSelected ? await loadSelectedFiles() : null;
    const filePaths = hasSelected ? files.map((file) => file.path) : [file.path];
    const icon = hasSelected ? files[0].thumb.path : file.thumb.path;

    try {
      getCurrentWebContents().startDrag({ file: file.path, files: filePaths, icon });
    } catch (error) {
      console.error(error), toast.error("File drag failed");
    }
  };

  return { onDragEnd, onDragStart };
};

export const useForceUpdate = () => {
  const [, setTick] = useState(0);
  const update = useCallback(() => setTick((tick) => tick + 1), []);
  return update;
};
