import {
  Dropdown,
  DropdownProps,
  HeaderWrapper,
  HeaderWrapperProps,
  NumInput,
  NumInputProps,
  ViewProps,
} from "medior/components";
import { LOGICAL_OPS, LogicalOp } from "medior/utils/common";

const LOG_OPS_OPTS = [
  { label: "Any", value: "" },
  ...LOGICAL_OPS.map((op) => ({ label: op, value: op })),
];

export interface LogOpsInputProps extends ViewProps {
  dropdownProps?: Partial<DropdownProps>;
  header?: HeaderWrapperProps["header"];
  headerProps?: HeaderWrapperProps["headerProps"];
  logOpValue: "" | LogicalOp;
  numInputProps?: Partial<NumInputProps>;
  numValue: number;
  numValueDisplay?: string;
  setLogOpValue: (val: LogicalOp) => void;
  setNumValue?: (val: number) => void;
  setNumValueDisplay?: (val: string) => void;
}

export const LogOpsInput = ({
  dropdownProps = {},
  header,
  headerProps,
  logOpValue,
  numInputProps,
  numValue,
  numValueDisplay,
  setLogOpValue,
  setNumValue,
  setNumValueDisplay,
  ...props
}: LogOpsInputProps) => {
  return (
    <HeaderWrapper row overflow="hidden" {...{ header, headerProps }} {...props}>
      <Dropdown
        value={logOpValue}
        setValue={setLogOpValue}
        options={LOG_OPS_OPTS}
        minWidth="3.7em"
        borderRadiuses={{ top: 0, right: 0 }}
        textAlign="center"
        {...dropdownProps}
      />

      <NumInput
        value={numValue}
        valueDisplay={numValueDisplay}
        setValue={setNumValue}
        setValueDisplay={setNumValueDisplay}
        disabled={logOpValue === ""}
        width="100%"
        textAlign="center"
        hasHelper={false}
        borderRadiuses={{ top: 0, left: 0 }}
        {...numInputProps}
      />
    </HeaderWrapper>
  );
};
