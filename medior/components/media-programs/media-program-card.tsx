import {
  Comp,
  ContextMenu,
  FileBase,
  Icon,
  ProgressBar,
  RatingButton,
  TagRow,
  Text,
  View,
  WatchStatusChip,
} from "medior/components";
import { MediaProgram, useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export interface MediaProgramCardProps {
  program: MediaProgram;
}

export const MediaProgramCard = Comp(({ program }: MediaProgramCardProps) => {
  const stores = useStores();
  const store = stores.mediaProgram;

  const details = [program.year, program.type, program.medium, program.language]
    .filter(Boolean)
    .join(" · ");
  const poster = store.manager.search.files.get(program.posterFileId);

  const handleClick = async (event: React.MouseEvent) => {
    const res = await store.manager.search.handleSelect({
      hasCtrl: event.ctrlKey,
      hasShift: event.shiftKey,
      id: program.id,
    });

    if (!res?.success) toast.error(res.error);
  };

  const handleDelete = () => {
    store.setIdsForConfirmDelete([program.id]);
    store.setIsConfirmDeleteOpen(true);
  };

  const handleOpen = async () => {
    store.editor.setIsOpen(true);

    const res = await store.editor.loadProgram(program.id);

    if (!res.success) toast.error(res.error);
  };

  const handleRating = async (rating: number) => {
    const res = await store.updateMediaProgram({ id: program.id, updates: { rating } });

    if (!res.success) toast.error(res.error);
  };

  const handleRefreshMeta = async () => {
    const res = await store.regenMediaProgramMeta([program.id]);

    if (!res.success) toast.error(res.error);
  };

  return (
    <ContextMenu
      id={program.id}
      menuItems={[
        { icon: "Edit", label: "Open", onClick: handleOpen },
        { icon: "Refresh", label: "Refresh Metadata", onClick: handleRefreshMeta },
        { color: colors.custom.red, icon: "Delete", label: "Delete", onClick: handleDelete },
      ]}
    >
      <FileBase.Container
        height="24rem"
        onClick={handleClick}
        onDoubleClick={handleOpen}
        selected={store.manager.search.getIsSelected(program.id)}
      >
        <View column flex={1} position="relative" overflow="hidden">
          {poster ? (
            <FileBase.Image
              thumb={poster.thumb}
              fileId={poster.id}
              isCorrupted={poster.isCorrupted}
              title={program.name}
              fit="cover"
              height="100%"
              rounded="top"
            />
          ) : (
            <View column flex={1} align="center" justify="center">
              <Icon name="LiveTv" size="3rem" color={colors.custom.grey} />
            </View>
          )}

          <WatchStatusChip
            position="top-right"
            opacity={0.9}
            isRewatching={program.isRewatching}
            watchStatus={program.watchStatus}
          />
        </View>

        <View column spacing="0.3rem" padding={{ all: "0.4rem 0.5rem" }}>
          <View row align="center" justify="space-between" spacing="0.3rem">
            <Text fontWeight={600} tooltip={program.name}>
              {program.name}
            </Text>

            <RatingButton rating={program.rating} setRating={handleRating} />
          </View>

          <Text preset="sub-text">{details}</Text>

          <ProgressBar
            numerator={program.watchedIdSet.size}
            denominator={program.fileCount}
            withText
          />

          {program.genres.length > 0 && (
            <TagRow tags={program.genres} limit={3} overflow="hidden" />
          )}
        </View>
      </FileBase.Container>
    </ContextMenu>
  );
});
