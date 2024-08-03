import { MutableRefObject, forwardRef } from "react";
import {
  Button,
  InputProps,
  InputWrapper,
  InputWrapperProps,
  TagInput,
  TagInputProps,
  Text,
  View,
} from "src/components";
import { observer, useStores } from "src/store";

interface LabelProps extends Omit<TagInputProps, "ref" | "value"> {
  inputProps?: Partial<InputProps>;
  isDuplicate?: boolean;
  setValue: InputProps["setValue"];
  value: string;
  wrapperProps?: Partial<InputWrapperProps>;
}

export const Label = observer(
  forwardRef(
    (
      {
        inputProps = {},
        isDuplicate,
        setValue,
        value,
        wrapperProps = {},
        ...tagInputProps
      }: LabelProps,
      ref?: MutableRefObject<HTMLDivElement>
    ) => {
      const stores = useStores();

      const handleEditExisting = (val: string) => {
        const tag = stores.tag.getByLabel(val);
        stores.tag.setActiveTagId(tag.id);
      };

      return (
        <InputWrapper label="Label" {...wrapperProps}>
          <TagInput
            value={undefined}
            onSelect={(option) => handleEditExisting(option.label)}
            inputProps={{
              error: isDuplicate,
              hasHelper: true,
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
            {...tagInputProps}
          />
        </InputWrapper>
      );
    }
  )
);
