import { useEffect, useRef, useState } from "react";
import { ListAllTagRegExOverlapsOutput } from "medior/_generated/server";
import {
  Button,
  Card,
  CenteredText,
  Comp,
  LoadingOverlay,
  Modal,
  TagChip,
  Text,
  View,
} from "medior/components";
import { tagToOption, useStores } from "medior/store";
import { colors, useCancellableLoad } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { rpc } from "medior/utils/server";

type RegExOverlaps = Awaited<ListAllTagRegExOverlapsOutput>["data"];

export interface RegExOverlapsModalProps {
  setVisible: (visible: boolean) => void;
}

export const RegExOverlapsModal = Comp(({ setVisible }: RegExOverlapsModalProps) => {
  const stores = useStores();
  const store = stores.tag;

  const load = useCancellableLoad();

  const [result, setResult] = useState<RegExOverlaps>(null);

  const hasOpenedMerger = useRef(false);

  const loadOverlaps = () =>
    load.run(async (signal) => {
      const res = await rpc.listAllTagRegExOverlaps(undefined, { signal });
      if (!res.success) throw new Error(res.error);

      setResult(res.data);
    });

  useEffect(() => {
    loadOverlaps();
  }, []);

  useEffect(() => {
    if (hasOpenedMerger.current && !store.merger.isOpen) {
      hasOpenedMerger.current = false;
      loadOverlaps();
    }
  }, [store.merger.isOpen]);

  const handleClose = () => {
    load.cancel();
    setVisible(false);
  };

  const handleMerge = (overlap: RegExOverlaps["overlaps"][number]) =>
    load.run(async (signal) => {
      const res = await rpc.listTag({ filter: { id: overlap.matchedTag.id } }, { signal });
      if (!res.success) throw new Error(res.error);

      const mergeTag = res.data[0];
      if (!mergeTag) throw new Error("Tag no longer exists");

      store.editor.setIsOpen(true);

      const editorRes = await store.editor.loadTag({ id: overlap.regExTag.id });
      if (!editorRes.success) throw new Error(editorRes.error);

      signal.throwIfAborted();

      if (store.editor.tag?.id === overlap.regExTag.id) {
        hasOpenedMerger.current = true;
        store.merger.setMergeTag(tagToOption(mergeTag));
        store.merger.setIsOpen(true);
      }
    });

  return (
    <Modal.Container onClose={handleClose} height="80%" width="50rem">
      <LoadingOverlay isLoading={load.isLoading} />

      <Modal.Header>
        <Text preset="title">{"Overlapping RegEx"}</Text>
      </Modal.Header>

      <Modal.Content>
        {result?.total > 0 && (
          <Text color={colors.custom.lightGrey} whiteSpace="normal">
            {`${Fmt.commas(result.total)} pairs where one tag's RegEx matches another tag's label or alias.${
              result.total > result.overlaps.length
                ? ` Showing the first ${Fmt.commas(result.overlaps.length)}.`
                : ""
            }`}
          </Text>
        )}

        {result?.overlaps.map((overlap) => (
          <Card
            key={`${overlap.regExTag.id}:${overlap.matchedTag.id}`}
            row
            align="center"
            flex="none"
            spacing="0.5rem"
          >
            <View row flex={1} align="center" minWidth={0} spacing="0.5rem">
              <TagChip tag={overlap.regExTag} hasEditor />

              <Text color={colors.custom.lightGrey}>{"matches"}</Text>

              <TagChip tag={overlap.matchedTag} hasEditor />

              <Text
                color={colors.custom.lightGrey}
                tooltip={overlap.matchedTag.term}
                tooltipProps={{ flexShrink: 1 }}
              >
                {`via "${overlap.matchedTag.term}"`}
              </Text>
            </View>

            <Button
              text="Merge"
              icon="Merge"
              onClick={() => handleMerge(overlap)}
              colorOnHover={colors.custom.purple}
            />
          </Card>
        ))}

        {result?.total === 0 && <CenteredText text="No overlapping RegEx found" />}
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} />
      </Modal.Footer>
    </Modal.Container>
  );
});
