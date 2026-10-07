import { PointerEvent, useEffect, useRef, useState } from "react";
import { Button, Comp, LoadingOverlay, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { makeClasses, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

interface Crop {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface ImageCropProps {
  expectedHash: string;
  fileId: string;
  onClose: () => void;
}

const HANDLES = ["e", "n", "ne", "nw", "s", "se", "sw", "w"] as const;

type Handle = (typeof HANDLES)[number] | "move";

export const ImageCrop = Comp(({ expectedHash, fileId, onClose }: ImageCropProps) => {
  const stores = useStores();
  const store = stores.carousel;

  const [crop, setCrop] = useState<Crop>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ height: number; src: string; width: number }>(null);

  const drag = useRef<{ crop: Crop; handle: Handle; pointerId: number; x: number; y: number }>(
    null,
  );
  const imageRef = useRef<HTMLImageElement>(null);

  const { css } = useClasses({ crop, preview });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await trpc.loadImageEditPreview.mutate({ expectedHash, fileId });

        if (!result.success) throw new Error(result.error);

        if (!cancelled) {
          setPreview(result.data);
          setCrop({ height: result.data.height, left: 0, top: 0, width: result.data.width });
        }
      } catch (error) {
        if (!cancelled) setError(error.message);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [expectedHash, fileId]);

  const handleClose = () => {
    if (!store.isEditingImage) onClose();
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!store.isEditingImage && event.button === 0) {
      const handle = (event.target as HTMLElement).dataset.handle as Handle;

      if (handle) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          crop,
          handle,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
      }
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current && drag.current.pointerId === event.pointerId && !store.isEditingImage) {
      const start = drag.current;
      const bounds = imageRef.current.getBoundingClientRect();
      const dx = Math.round(((event.clientX - start.x) / bounds.width) * preview.width);
      const dy = Math.round(((event.clientY - start.y) / bounds.height) * preview.height);
      let left = start.crop.left;
      let top = start.crop.top;
      let right = left + start.crop.width;
      let bottom = top + start.crop.height;

      if (start.handle === "move") {
        left = Math.max(0, Math.min(preview.width - start.crop.width, left + dx));
        top = Math.max(0, Math.min(preview.height - start.crop.height, top + dy));
        right = left + start.crop.width;
        bottom = top + start.crop.height;
      } else {
        if (start.handle.includes("w")) left = Math.max(0, Math.min(right - 1, left + dx));

        if (start.handle.includes("e"))
          right = Math.min(preview.width, Math.max(left + 1, right + dx));

        if (start.handle.includes("n")) top = Math.max(0, Math.min(bottom - 1, top + dy));

        if (start.handle.includes("s"))
          bottom = Math.min(preview.height, Math.max(top + 1, bottom + dy));
      }

      setCrop({ height: bottom - top, left, top, width: right - left });
    }
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleReset = () => {
    setCrop({ height: preview.height, left: 0, top: 0, width: preview.width });
  };

  const save = async (saveCopy: boolean) => {
    const result = await store.editImage({ crop, expectedHash, fileId, saveCopy });

    if (result.success) {
      toast.success(saveCopy ? "Cropped copy saved" : "Image cropped");
      onClose();
    } else toast.error(result.error);
  };

  const handleSave = () => save(false);

  const handleSaveCopy = () => save(true);

  return (
    <Modal.Container
      height="90vh"
      width="90vw"
      isLoading={store.isEditingImage}
      onClose={handleClose}
      onKeyDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <LoadingOverlay
        isLoading={!preview && !error}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Header>
        <Text preset="title">{"Crop Image"}</Text>
      </Modal.Header>

      <Modal.Content align="center" justify="center" overflow="hidden">
        {error && <Text>{error}</Text>}

        {preview && crop && (
          <View className={css.surface}>
            <View
              component="img"
              ref={imageRef}
              src={preview.src}
              draggable={false}
              className={css.image}
              alt="Crop preview"
            />

            <View
              className={css.selection}
              data-handle="move"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onLostPointerCapture={handlePointerEnd}
            >
              {HANDLES.map((handle) => (
                <View
                  key={handle}
                  aria-label={`Resize crop ${handle}`}
                  className={css.handle}
                  cursor={`${handle}-resize`}
                  data-handle={handle}
                />
              ))}
            </View>
          </View>
        )}
      </Modal.Content>

      <Modal.Footer>
        <View flex={1}>
          <Text>
            {crop
              ? `${crop.width} × ${crop.height} px · Drag the edges, corners, or selection`
              : ""}
          </Text>
        </View>

        <Button text="Reset" onClick={handleReset} disabled={!preview || store.isEditingImage} />

        <Button text="Cancel" onClick={handleClose} disabled={store.isEditingImage} />

        <Button
          text="Save a Copy"
          onClick={handleSaveCopy}
          disabled={!crop || store.isEditingImage}
        />

        <Button text="Save" onClick={handleSave} disabled={!crop || store.isEditingImage} />
      </Modal.Footer>
    </Modal.Container>
  );
});

interface ClassesProps {
  crop: Crop;
  preview: { height: number; width: number };
}

const useClasses = makeClasses(({ crop, preview }: ClassesProps) => ({
  handle: {
    '&[data-handle*="e"]': { left: "100%" },
    '&[data-handle*="n"]': { top: 0 },
    '&[data-handle*="s"]': { top: "100%" },
    '&[data-handle*="w"]': { left: 0 },
    background: "white",
    border: "1px solid black",
    height: 12,
    left: "50%",
    position: "absolute",
    top: "50%",
    touchAction: "none",
    transform: "translate(-50%, -50%)",
    width: 12,
  },
  image: {
    display: "block",
    maxHeight: "calc(90vh - 12rem)",
    maxWidth: "calc(90vw - 5rem)",
    userSelect: "none",
  },
  selection: {
    ...(crop &&
      preview && {
        height: `${(crop.height / preview.height) * 100}%`,
        left: `${(crop.left / preview.width) * 100}%`,
        top: `${(crop.top / preview.height) * 100}%`,
        width: `${(crop.width / preview.width) * 100}%`,
      }),
    border: "1px solid white",
    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
    boxSizing: "border-box",
    cursor: "move",
    position: "absolute",
    touchAction: "none",
  },
  surface: {
    flexShrink: 0,
    lineHeight: 0,
    position: "relative",
  },
}));
