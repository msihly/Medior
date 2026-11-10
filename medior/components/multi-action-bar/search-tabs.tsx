import { MouseEvent } from "react";
import { Button, Comp, Icon, IconButton, View } from "medior/components";
import { FileSearch, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { CONTROL_RADIUS } from "medior/utils/common";

/** The Files view's searches, each labeled by its first tag. Tabs after the first can close. */
export const SearchTabs = Comp(() => {
  const stores = useStores();
  const store = stores.file;

  const handleNew = async () => {
    const res = await store.openSearchTab();
    if (!res.success) toast.error(res.error);
  };

  return (
    <View
      row
      align="center"
      spacing="0.2rem"
      padding={{ all: "0.2rem" }}
      bgColor={colors.input}
      borderRadiuses={{ all: CONTROL_RADIUS }}
    >
      {store.searchTabs.map((search, index) => (
        <SearchTab key={search.$modelId} index={index} search={search} />
      ))}

      <IconButton name="Add" size="small" tooltip="New Search Tab" onClick={handleNew} />
    </View>
  );
});

interface SearchTabProps {
  index: number;
  search: FileSearch;
}

const SearchTab = Comp(({ index, search }: SearchTabProps) => {
  const stores = useStores();
  const store = stores.file;

  const isActive = index === store.searchIndex;
  const tagCount = search.tags.length;

  const handleClick = () => store.setSearchIndex(index);

  const handleClose = (event: MouseEvent) => {
    event.stopPropagation();
    store.closeSearchTab(index);
  };

  return (
    <Button
      text={search.tags[0]?.label ?? "All Files"}
      onClick={handleClick}
      color={isActive ? colors.control : "transparent"}
      colorOnHover={colors.control}
      textColor={isActive ? colors.custom.white : colors.custom.lightGrey}
      pill={tagCount > 1 ? `+${tagCount - 1}` : undefined}
      endNode={index > 0 && <Icon name="Close" size="1em" onClick={handleClose} />}
    />
  );
});
