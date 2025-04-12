import { forwardRef, MutableRefObject, useState } from "react";
import { HeaderWrapper, HeaderWrapperProps, Input, InputProps, View } from "medior/components";
import { MultiInputList } from "./multi-input-list";

export interface MultiInputProps<T = string> {
  hasDelete?: boolean;
  hasEditor?: boolean;
  hasHelper?: boolean;
  hasList?: boolean;
  header?: HeaderWrapperProps["header"];
  headerProps?: HeaderWrapperProps["headerProps"];
  inputProps?: InputProps;
  max?: number;
  onChange: (val: T[]) => void;
  single?: boolean;
  value: T[];
}

export const MultiInput = forwardRef(
  (
    {
      hasDelete = true,
      hasHelper = false,
      hasList = true,
      header,
      headerProps = {},
      inputProps,
      max,
      onChange,
      single,
      value = [],
    }: MultiInputProps,
    inputRef?: MutableRefObject<HTMLDivElement>,
  ) => {
    const isMax = max > -1 && value.length >= max;
    const disabled = inputProps?.disabled || isMax;

    const [inputValue, setInputValue] = useState("");

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !isMax) {
        e.preventDefault();
        if (!value.includes(inputValue)) onChange([...value, inputValue]);
        setInputValue("");
      }
    };

    const renderList = () => (
      <MultiInputList {...{ hasDelete }} search={{ onChange, value }} hasInput />
    );

    return (
      <View column height="100%" width="100%">
        {single && value.length > 0 ? (
          <HeaderWrapper {...{ header, headerProps }}>{renderList()}</HeaderWrapper>
        ) : (
          <>
            <Input
              {...{ disabled, hasHelper, header, headerProps }}
              {...inputProps}
              onKeyDown={onKeyDown}
              ref={inputRef}
              value={inputValue}
              setValue={setInputValue}
              borderRadiuses={{ bottom: !single && hasList ? 0 : undefined }}
            />

            {!single && hasList && renderList()}
          </>
        )}
      </View>
    );
  },
);
