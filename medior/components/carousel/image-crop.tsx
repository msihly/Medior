import { PointerEvent, useEffect, useRef, useState } from "react";
import Color from "color";
import { Button, Comp, LoadingOverlay, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors, makeClasses, toast, useElementResize } from "medior/utils/client";
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
  const surfaceRef = useRef<HTMLDivElement>(null);

  const imageDims = useElementResize(imageRef, preview);
  const surfaceDims = useElementResize(surfaceRef, preview);

  const { css } = useClasses({
    crop,
    image: {
      height: imageDims.height,
      left: imageDims.left - surfaceDims.left,
      top: imageDims.top - surfaceDims.top,
      width: imageDims.width,
    },
    maskSpread: Math.max(surfaceDims.height, surfaceDims.width),
    preview,
  });

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
      height="100%"
      width="100%"
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
          <>
            <View
              ref={surfaceRef}
              column
              flex={1}
              minHeight={0}
              width="100%"
              align="center"
              justify="center"
              overflow="hidden"
              padding={{ all: "0.5rem" }}
              position="relative"
            >
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

            <Text>{`${crop.width} × ${crop.height} px`}</Text>
          </>
        )}
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Reset"
          icon="RestartAlt"
          onClick={handleReset}
          disabled={!preview || store.isEditingImage}
        />

        <Button text="Cancel" icon="Close" onClick={handleClose} disabled={store.isEditingImage} />

        <Button
          text="Save a Copy"
          icon="SaveAs"
          onClick={handleSaveCopy}
          disabled={!crop || store.isEditingImage}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSave}
          disabled={!crop || store.isEditingImage}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});

interface ClassesProps {
  crop: Crop;
  image: { height: number; left: number; top: number; width: number };
  maskSpread: number;
  preview: { height: number; width: number };
}

const useClasses = makeClasses(({ crop, image, maskSpread, preview }: ClassesProps) => ({
  handle: {
    '&[data-handle*="e"]': { left: "100%" },
    '&[data-handle*="n"]': { top: 0 },
    '&[data-handle*="s"]': { top: "100%" },
    '&[data-handle*="w"]': { left: 0 },
    background: colors.custom.white,
    border: `1px solid ${colors.custom.black}`,
    height: "0.75rem",
    left: "50%",
    position: "absolute",
    top: "50%",
    touchAction: "none",
    transform: "translate(-50%, -50%)",
    width: "0.75rem",
  },
  image: {
    maxHeight: "100%",
    maxWidth: "100%",
    userSelect: "none",
  },
  selection: {
    ...(crop &&
      preview && {
        height: (crop.height / preview.height) * image.height,
        left: image.left + (crop.left / preview.width) * image.width,
        top: image.top + (crop.top / preview.height) * image.height,
        width: (crop.width / preview.width) * image.width,
      }),
    border: `1px solid ${colors.custom.white}`,
    boxShadow: `0 0 0 ${maskSpread}px ${Color(colors.custom.black).fade(0.5).string()}`,
    boxSizing: "border-box",
    cursor: "move",
    position: "absolute",
    touchAction: "none",
  },
}));
