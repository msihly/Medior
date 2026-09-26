import { Button, Comp, InputProps, TagInput, TagInputProps, Text, View } from "medior/components";
import { TagEditorStore, TagOption, tagToOption, useStores } from "medior/store";
import { toast } from "medior/utils/client";

interface LabelProps extends Omit<TagInputProps, "ref" | "value"> {
  inputProps?: Partial<InputProps>;
  isDuplicate?: boolean;
  onLoadTag?: TagEditorStore["loadTag"];
  setValue: InputProps["setValue"];
  value: string;
}

export const Label = Comp(
  (
    {
      hasHelper = true,
      inputProps = {},
      isDuplicate,
      onLoadTag,
      setValue,
      value,
      width = "100%",
      ...tagInputProps
    }: LabelProps,
    ref,
  ) => {
    const stores = useStores();
    const store = stores.tag;

    const handleEditExisting = async () => {
      const res = await store.getByLabel(value);
      if (!res.success || !res.data?.id) return toast.error("Failed to load existing tag");

      await handleSelectExisting(tagToOption(res.data));
    };

    const handleSelectExisting = async (option: TagOption) => {
      const res = await (onLoadTag ?? store.editor.loadTag)({ id: option.id });
      if (!res.success) toast.error(res.error);
    };

    return (
      <TagInput
        header="Label"
        value={undefined}
        onSelect={handleSelectExisting}
        hasList={false}
        width={width}
        {...tagInputProps}
        inputProps={{
          error: isDuplicate,
          hasHelper,
          helperText: isDuplicate && (
            <View row align="center" justify="center">
              <Text>{"Tag already exists"}</Text>

              <Button
                type="link"
                text="(Click to edit)"
                onClick={handleEditExisting}
                fontSize="0.85em"
              />
            </View>
          ),
          ref,
          setValue,
          value,
          ...inputProps,
        }}
      />
    );
  },
);
