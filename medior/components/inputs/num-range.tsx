import { HeaderWrapperProps, NumInput, NumInputProps, RangeWrapper } from "medior/components";

export interface NumRangeProps {
  hasHelper?: boolean;
  header?: HeaderWrapperProps["header"];
  headerProps?: HeaderWrapperProps["headerProps"];
  max: number;
  min: number;
  numInputProps?: Partial<NumInputProps>;
  setMax: (val: number) => void;
  setMin: (val: number) => void;
}

export const NumRange = ({
  hasHelper = false,
  header,
  headerProps,
  max,
  min,
  numInputProps = {},
  setMax,
  setMin,
}: NumRangeProps) => {
  return (
    <RangeWrapper
      header={header}
      headerProps={headerProps}
      startInput={
        <NumInput
          {...numInputProps}
          {...{ hasHelper }}
          value={min}
          setValue={setMin}
          placeholder="Min"
          textAlign="center"
          borderRadiuses={{ top: 0, right: 0 }}
        />
      }
      endInput={
        <NumInput
          {...numInputProps}
          {...{ hasHelper }}
          value={max}
          setValue={setMax}
          placeholder="Max"
          textAlign="center"
          borderRadiuses={{ top: 0, left: 0 }}
        />
      }
    />
  );
};
