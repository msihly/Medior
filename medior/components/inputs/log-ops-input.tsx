import {
  Dropdown,
  DropdownProps,
  HeaderWrapper,
  HeaderWrapperProps,
  NumInput,
  NumInputProps,
} from "medior/components";
import { LOGICAL_OPS, LogicalOp } from "medior/utils";

const LOG_OPS_OPTS = [
  { label: "Any", value: "" },
  ...LOGICAL_OPS.map((op) => ({ label: op, value: op })),
];

export interface LogOpsInputProps {
  dropdownProps?: Partial<DropdownProps>;
  header?: HeaderWrapperProps["header"];
  headerProps?: HeaderWrapperProps["headerProps"];
  logOpValue: "" | LogicalOp;
  numInputProps?: Partial<NumInputProps>;
  numValue: number;
  setLogOpValue: (val: LogicalOp) => void;
  setNumValue: (val: number) => void;
}

export const LogOpsInput = ({
  dropdownProps = {},
  header,
  headerProps,
  logOpValue,
  numInputProps,
  numValue,
  setLogOpValue,
  setNumValue,
}: LogOpsInputProps) => {
  return (
    <HeaderWrapper row header={header} headerProps={headerProps}>
      <Dropdown
        value={logOpValue}
        setValue={setLogOpValue}
        options={LOG_OPS_OPTS}
        width="3.6em"
        borderRadiuses={{ top: 0, right: 0 }}
        {...dropdownProps}
      />

      <NumInput
        value={numValue}
        setValue={setNumValue}
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
