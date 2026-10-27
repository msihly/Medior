import { ReactNode } from "react";
import {
  Card,
  Chip,
  Comp,
  ContextMenu,
  FileBase,
  FileCard,
  RatingButton,
  TagRow,
  Text,
  View,
} from "medior/components";
import { makeTileClickHandler } from "medior/components/files/hooks";
import { FileCollection as FileCollType, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

export interface FileCollectionProps {
  collection: FileCollType;
  disableSelection?: boolean;
  rightNode?: ReactNode;
}

export const FileCollection = Comp(
  ({ collection, disableSelection = false, rightNode }: FileCollectionProps) => {
    const stores = useStores();
    const store = stores.collection.manager;

    const handleClick = makeTileClickHandler({
      disabled: disableSelection,
      id: collection.id,
      select: store.search.handleSelect,
    });

    const handleDelete = () => {
      stores.collection.setIdsForConfirmDelete([collection.id]);
      stores.collection.setIsConfirmDeleteOpen(true);
    };

    const handleRating = async (rating: number) => {
      const res = await stores.collection.updateCollRating({ id: collection.id, rating });
      if (!res.success) toast.error(res.error);
    };

    const handleRefreshMeta = async () => {
      const res = await stores.collection.regenCollMeta([collection.id]);
      if (!res.success) toast.error(res.error);
    };

    const openCollection = async () => {
      stores.collection.editor.setIsOpen(true);
      await stores.collection.editor.loadCollection(collection.id);
    };

    return (
      <ContextMenu
        id={collection.id}
        menuItems={[
          { icon: "Refresh", label: "Refresh Metadata", onClick: handleRefreshMeta },
          { color: colors.custom.red, icon: "Delete", label: "Delete", onClick: handleDelete },
        ]}
      >
        <FileBase.Container
          height="100%"
          width="100%"
          onClick={handleClick}
          onDoubleClick={openCollection}
          selected={!disableSelection && store.search.getIsSelected(collection.id)}
        >
          <Card
            row
            height="100%"
            bgColor={colors.foregroundCard}
            padding={{ all: 0 }}
            overflow="hidden"
            headerProps={{ flex: "none", padding: { all: "0.5rem" } }}
            header={
              <View column spacing="0.5rem" width="100%">
                <View row align="center" justify="space-between" width="100%">
                  <View row align="center" spacing="0.5rem">
                    <RatingButton
                      disabled={disableSelection}
                      rating={collection.rating}
                      setRating={handleRating}
                    />

                    <Text color={colors.custom.lightBlue}>{collection.title}</Text>
                  </View>

                  <View row align="center" spacing="0.5rem">
                    {rightNode}

                    <Chip label={`${collection.fileCount} files`} height="1.5em" />

                    <Chip label={Fmt.bytes(collection.size ?? 0)} height="1.5em" />
                  </View>
                </View>

                {!collection.tags?.length ? null : (
                  <TagRow tags={collection.tags} limit={15} overflow="hidden" />
                )}
              </View>
            }
          >
            {collection.previewIds.map((id, idx) => (
              <FileCard
                key={idx}
                file={store.search.files.get(id)}
                store={stores.file.search}
                height={250}
                width={230}
                disabled
              />
            ))}
          </Card>
        </FileBase.Container>
      </ContextMenu>
    );
  },
);
