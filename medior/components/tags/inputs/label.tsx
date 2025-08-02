import { forwardRef, MutableRefObject } from "react";
import { Button, Comp, InputProps, TagInput, TagInputProps, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { toast } from "medior/utils/client";

interface LabelProps extends Omit<TagInputProps, "ref" | "value"> {
  inputProps?: Partial<InputProps>;
  isDuplicate?: boolean;
  setValue: InputProps["setValue"];
  value: string;
}

export const Label = Comp(
  forwardRef(
    (
      {
        hasHelper = true,
        inputProps = {},
        isDuplicate,
        setValue,
        value,
        width = "100%",
        ...tagInputProps
      }: LabelProps,
      ref?: MutableRefObject<HTMLDivElement>,
    ) => {
      const stores = useStores();

      const handleEditExisting = async (val: string) => {
        const tag = (await stores.tag.editor.getByLabel(val)).data;
        if (tag?.id) stores.tag.editor.loadTag(tag.id);
        else toast.error("Failed to load existing tag");
      };

      return (
        <TagInput
          header="Label"
          value={undefined}
          onSelect={(option) => handleEditExisting(option.label)}
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
                  onClick={() => handleEditExisting(value)}
                  fontSize="0.85em"
                />
              </View>
            ),
            ref,
            setValue,
            textAlign: "center",
            value,
            ...inputProps,
          }}
        />
      );
    },
  ),
);
