import {
  Button,
  ButtonProps,
  Chip,
  Comp,
  Icon,
  MenuButton,
  MenuButtonProps,
  SortMenu,
  SortMenuProps,
  Text,
  UniformList,
  View,
  ViewProps,
} from "medior/components";
import { FileCollectionSearch, FileSearch, TagSearch } from "medior/store";
import { colors, CSS, makeClasses } from "medior/utils/client";

export interface FilterMenuProps extends Omit<ButtonProps, "onChange" | "value"> {
  color?: string;
  menuProps?: Partial<MenuButtonProps>;
  sortOptions: SortMenuProps["rows"];
  store: FileCollectionSearch | FileSearch | TagSearch;
  viewProps?: ViewProps;
  width?: CSS["width"];
}

export const FilterMenu = Comp(
  ({
    children,
    color = colors.custom.black,
    menuProps = {},
    sortOptions,
    store,
    viewProps = {},
    width = "fit-content",
    ...buttonProps
  }: FilterMenuProps) => {
    const { css, cx } = useClasses({ width });

    const handleReset = () => {
      store.reset();
      handleSearch();
    };

    const handleSearch = () => store.loadFiltered({ page: 1 });

    const setSortValue = (val: SortMenuProps["value"]) => store.setSortValue(val);

    const renderButton = (onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void) => (
      <Button
        onClick={onOpen}
        color={store.hasChanges ? colors.custom.purple : color}
        justify="space-between"
        padding={{ left: "0.5em", right: "0.5em" }}
        className={cx(css.button, buttonProps?.className)}
        {...buttonProps}
      >
        <View row spacing="0.5rem" margins={{ right: "0.5rem" }}>
          <Icon name="FilterAlt" size="1.15em" />

          <Text>{"Filter Results"}</Text>
        </View>

        <Chip
          label={store.numOfFilters}
          bgColor={store.numOfFilters > 0 ? colors.custom.blue : colors.foregroundCard}
          height="1.2rem"
          width="2rem"
          size="small"
        />
      </Button>
    );

    return (
      <MenuButton button={renderButton} {...menuProps}>
        <View column padding={{ all: "0.5rem" }} spacing="0.5rem" overflow="auto" {...viewProps}>
          <UniformList row spacing="0.5rem">
            <Button
              text="Search"
              icon="Search"
              onClick={handleSearch}
              disabled={store.isLoading}
              color={store.hasChanges ? colors.custom.purple : colors.custom.blue}
            />

            <Button
              text="Reset"
              icon="Refresh"
              onClick={handleReset}
              disabled={store.isLoading}
              color={colors.foregroundCard}
              colorOnHover={colors.custom.red}
            />

            <SortMenu
              rows={sortOptions}
              value={store.sortValue}
              setValue={setSortValue}
              color={colors.foregroundCard}
            />
          </UniformList>

          {children}
        </View>
      </MenuButton>
    );
  }
);

interface ClassesProps {
  width: CSS["width"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  button: {
    width: props.width,
  },
}));
