import { Button, Chip, Icon, Text, UniformList, View } from "medior/components";
import { ButtonProps, MenuButton, MenuButtonProps, SortMenu, SortMenuProps } from ".";
import { colors, CSS, makeClasses } from "medior/utils";
import { FileCollectionSearch, FileSearch, observer, TagSearch } from "medior/store";

export interface FilterMenuProps extends Omit<ButtonProps, "onChange" | "value"> {
  color?: string;
  menuProps?: Partial<MenuButtonProps>;
  sortOptions: SortMenuProps["rows"];
  store: FileCollectionSearch | FileSearch | TagSearch;
  width?: CSS["width"];
}

export const FilterMenu = observer(
  ({
    children,
    color = colors.custom.black,
    menuProps = {},
    sortOptions,
    store,
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

        {store.numOfFilters > 0 && (
          <Chip
            label={store.numOfFilters}
            bgColor={colors.custom.blue}
            height="1.2rem"
            width="2rem"
            size="small"
          />
        )}
      </Button>
    );

    return (
      <MenuButton button={renderButton} {...menuProps}>
        <View column padding={{ all: "0.5rem" }} spacing="0.5rem" overflow="auto">
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

const useClasses = makeClasses(({ width }: ClassesProps) => ({
  button: {
    width,
  },
}));
