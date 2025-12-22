import { round } from "es-toolkit";
import {
  Card,
  Chip,
  Comp,
  ContextMenu,
  Divider,
  FileBase,
  FileCard,
  TagRow,
  Text,
  View,
} from "medior/components";
import { FileCollection as FileCollType, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export interface FileCollectionProps {
  collection: FileCollType;
}

export const FileCollection = Comp(({ collection }: FileCollectionProps) => {
  const stores = useStores();
  const store = stores.collection.manager;

  const handleClick = async (event: React.MouseEvent) => {
    const res = await store.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: collection.id,
    });
    if (!res?.success) toast.error(res.error);
  };

  const handleDelete = async () => {
    await stores.collection.editor.loadCollection(collection.id);
    stores.collection.setIsConfirmDeleteOpen(true);
  };

  const handleRefreshMeta = () => stores.collection.regenCollMeta([collection.id]);

  const openCollection = async () => {
    stores.collection.editor.setIsOpen(true);
    await stores.collection.editor.loadCollection(collection.id);
  };

  return (
    <ContextMenu
      id={collection.id}
      menuItems={[
        { label: "Refresh Metadata", icon: "Refresh", onClick: handleRefreshMeta },
        { label: "Delete", icon: "Delete", color: colors.custom.red, onClick: handleDelete },
      ]}
    >
      <FileBase.Container
        height="100%"
        width="100%"
        onClick={handleClick}
        onDoubleClick={openCollection}
        selected={store.search.getIsSelected(collection.id)}
      >
        <Card
          row
          height="100%"
          bgColor={colors.foregroundCard}
          padding={{ all: 0 }}
          overflow="hidden"
          header={
            <View column width="100%">
              <View
                row
                align="center"
                justify="space-between"
                width="100%"
                padding={{ all: "0.2rem 0.3rem 0 0.4rem" }}
              >
                <Text>{collection.title}</Text>

                <View row spacing="0.5rem">
                  <Chip label={`${collection.fileCount} files`} height="1.5em" />

                  <FileBase.RatingChip position="top-left" rating={round(collection.rating, 1)} />
                </View>
              </View>

              {!collection.tags ? null : (
                <>
                  <Divider sx={{ height: "2px", margin: "0 0 0.3rem 0" }} />
                  <TagRow
                    tags={collection.tags.slice(0, 15)}
                    padding={{ all: "0 0.3rem 0.3rem 0.2rem" }}
                  />
                </>
              )}
            </View>
          }
        >
          {collection.previewIds.map((id, idx) => (
            <FileCard
              key={idx}
              file={store.search.files.get(id)}
              height={250}
              width={230}
              disabled
            />
          ))}
        </Card>
      </FileBase.Container>
    </ContextMenu>
  );
});
