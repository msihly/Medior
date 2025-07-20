import { forwardRef, MutableRefObject } from "react";
import { Button, Comp, InputProps, TagInput, TagInputProps, Text, View } from "medior/components";
import { useStores } from "medior/store";

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

      const handleEditExisting = (val: string) => {
        const tag = stores.tag.getByLabel(val);
        stores.tag.editor.loadTag(tag.id);
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
