import { useState } from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import { Button, InputWrapper, Modal, TagInput, Text, View } from "components";
import { colors, makeClasses } from "utils";

export const TagMerger = observer(() => {
  const { css } = useClasses(null);

  const { tagStore } = useStores();

  const baseTagValue = tagStore.activeTag ? [tagStore.activeTag?.tagOption] : [];

  const [selectedTagValue, setSelectedTagValue] = useState<TagOption[]>([]);

  const handleClose = () => {
    tagStore.setIsTagMergerOpen(false);
    tagStore.setActiveTagId(null); // TODO: Change to the resulting tag id
  };

  const handleConfirm = async () => {};

  return (
    <Modal.Container onClose={handleClose} width="50rem" draggable>
      <Modal.Header>
        <Text>{"Merge Tags"}</Text>
      </Modal.Header>

      <Modal.Content>
        <View row>
          <InputWrapper label="Base Tag">
            <TagInput value={baseTagValue} disabled />
          </InputWrapper>

          <InputWrapper label="Select Tag to Merge">
            <TagInput
              options={[...tagStore.tagOptions]}
              excludeOptions={baseTagValue}
              value={selectedTagValue}
              onChange={setSelectedTagValue}
              maxTags={1}
            />
          </InputWrapper>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} color={colors.button.grey} />

        <Button text="Confirm" icon="Check" onClick={handleConfirm} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({});
