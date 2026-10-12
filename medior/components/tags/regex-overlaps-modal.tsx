import { useEffect, useState } from "react";
import { ListAllTagRegExOverlapsOutput } from "medior/_generated/server";
import {
  Button,
  CenteredText,
  Comp,
  LoadingOverlay,
  Modal,
  TagChip,
  Text,
  View,
} from "medior/components";
import { colors, useCancellableLoad } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export interface RegExOverlapsModalProps {
  setVisible: (visible: boolean) => void;
}

export const RegExOverlapsModal = Comp(({ setVisible }: RegExOverlapsModalProps) => {
  const load = useCancellableLoad();

  const [result, setResult] = useState<Awaited<ListAllTagRegExOverlapsOutput>["data"]>(null);

  useEffect(() => {
    load.run(async (signal) => {
      const res = await trpc.listAllTagRegExOverlaps.mutate(undefined, { signal });
      if (!res.success) throw new Error(res.error);

      setResult(res.data);
    });
  }, []);

  const handleClose = () => {
    load.cancel();
    setVisible(false);
  };

  return (
    <Modal.Container onClose={handleClose} height="80%" width="50rem">
      <LoadingOverlay isLoading={load.isLoading} />

      <Modal.Header>
        <Text preset="title">{"Overlapping RegEx"}</Text>
      </Modal.Header>

      <Modal.Content spacing="0.5rem">
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
          <View
            key={`${overlap.regExTag.id}:${overlap.matchedTag.id}`}
            row
            align="center"
            spacing="0.5rem"
          >
            <TagChip tag={overlap.regExTag} hasEditor />

            <Text color={colors.custom.lightGrey}>{"matches"}</Text>

            <TagChip tag={overlap.matchedTag} hasEditor />

            <Text color={colors.custom.lightGrey} tooltip={overlap.matchedTag.term}>
              {`via "${overlap.matchedTag.term}"`}
            </Text>
          </View>
        ))}

        {result?.total === 0 && <CenteredText text="No overlapping RegEx found" />}
      </Modal.Content>

      <Modal.Footer>
        <Button text="Close" icon="Close" onClick={handleClose} />
      </Modal.Footer>
    </Modal.Container>
  );
});
