import { useEffect, useState } from "react";
import { FormControlLabel, Radio, RadioGroup } from "@mui/material";
import { MUI_ICONS } from "medior/_generated/client";
import {
  Button,
  ButtonProps,
  Card,
  Comp,
  Icon,
  IconButton,
  IconName,
  Input,
  MenuButton,
  MenuButtonProps,
  Pagination,
  Text,
  View,
  ViewProps,
} from "medior/components";
import { colors, CSS } from "medior/utils/client";
import { chunkArray } from "medior/utils/common";

const SEARCH_STYLES = ["Filled", "Outlined", "Rounded", "TwoTone", "Sharp"] as const;

const SEARCH_STYLES_UNFILLED = SEARCH_STYLES.filter((s) => s !== "Filled");

type SearchStyle = (typeof SEARCH_STYLES)[number];

export interface IconPickerProps extends Omit<ButtonProps, "onChange" | "value"> {
  color?: string;
  label?: string;
  menuProps?: Partial<MenuButtonProps>;
  setValue: (val: IconName | null) => void;
  value: IconName | null;
  viewProps?: ViewProps;
  withStylePicker?: boolean;
  width?: CSS["width"];
}

export const IconPicker = Comp(
  ({
    color = colors.custom.black,
    label = "Icon",
    menuProps = {},
    setValue,
    value,
    viewProps = {},
    width = "fit-content",
    withStylePicker = false, // Not used with icon font
    ...buttonProps
  }: IconPickerProps) => {
    const [page, setPage] = useState(1);
    const [searchStyle, setSearchStyle] = useState<SearchStyle>("Filled");
    const [searchVal, setSearchVal] = useState("");

    const searchTerms = searchVal.split(" ").filter((t) => t.length > 0);

    const filteredIcons = MUI_ICONS.filter((icon) => {
      const name = icon.toLowerCase();
      if (value?.length && name.includes(value.toLowerCase())) return false;

      if (searchStyle === "Filled") {
        if (SEARCH_STYLES_UNFILLED.some((s) => name.includes(s.toLowerCase()))) return false;
      } else if (!name.includes(searchStyle.toLowerCase())) return false;

      if (!searchTerms.length) return true;
      return searchTerms.every((term) => name.includes(term.toLowerCase()));
    });

    const pageSize = 25 - (value?.length ? 1 : 0);
    const pageCount = Math.ceil(filteredIcons.length / pageSize);
    const pageIcons = [
      value?.length ? value : null,
      ...filteredIcons.slice(pageSize * (page - 1), pageSize * page),
    ].filter(Boolean);

    useEffect(() => {
      if (page > pageCount) setPage(1);
    }, [pageCount, page]);

    const handleNoIcon = () => setValue(null);

    const handleSearchStyleChange = (event: React.ChangeEvent<HTMLInputElement>) =>
      setSearchStyle(event.target.value as SearchStyle);

    const renderButton = (onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void) => (
      <Button
        onClick={onOpen}
        color={color}
        justify="space-between"
        padding={{ left: "0.5em", right: "0.5em" }}
        width={width}
        {...buttonProps}
      >
        <View row spacing="0.5rem" align="center" padding={{ left: "0.5rem" }}>
          <Text lineHeight={1}>{label}</Text>

          <Icon name={value} />
        </View>
      </Button>
    );

    return (
      <MenuButton button={renderButton} keepMounted={false} {...menuProps}>
        <View column padding={{ all: "0.5rem" }} spacing="0.5rem" overflow="auto" {...viewProps}>
          <Input header="Search" value={searchVal} setValue={setSearchVal} />

          <Button
            text="No Icon"
            icon="Close"
            onClick={handleNoIcon}
            color={value === null ? colors.custom.black : colors.background}
            textColor={value === null ? colors.custom.white : colors.custom.lightGrey}
          />

          <View row position="relative" spacing="0.5rem">
            {!withStylePicker ? null : (
              <Card column header="Style">
                <RadioGroup value={searchStyle} onChange={handleSearchStyleChange}>
                  <FormControlLabel label="Filled" value="Filled" control={<Radio />} />
                  <FormControlLabel label="Outlined" value="Outlined" control={<Radio />} />
                  <FormControlLabel label="Rounded" value="Rounded" control={<Radio />} />
                  <FormControlLabel label="Two Tone" value="TwoTone" control={<Radio />} />
                  <FormControlLabel label="Sharp" value="Sharp" control={<Radio />} />
                </RadioGroup>
              </Card>
            )}

            <View column width="16rem" height="19rem">
              {chunkArray(pageIcons, 5).map((swatch, i) => (
                <View key={i} row>
                  {swatch.map((icon) => (
                    <IconButton
                      key={icon}
                      name={icon}
                      tooltip={icon}
                      iconProps={{ size: "1.4em" }}
                      sx={{
                        border: `3px solid ${value === icon ? colors.custom.white : "transparent"}`,
                      }}
                      onClick={() => setValue(icon)}
                    />
                  ))}
                </View>
              ))}
            </View>

            <Pagination
              count={pageCount}
              page={page}
              onChange={setPage}
              siblingCount={0}
              boundaryCount={withStylePicker ? 1 : 0}
            />
          </View>
        </View>
      </MenuButton>
    );
  },
);
