import {
  Button,
  Chip,
  Comp,
  FileBase,
  Icon,
  IconName,
  MEDIA_PROGRAM_BUTTON_PROPS,
  MEDIA_PROGRAM_RADIUS,
  MediaProgramInlineInput,
  Text,
  View,
} from "medior/components";
import { MusicAlbum, MusicItemKind, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

const KINDS: Record<MusicItemKind, { icon: IconName; label: string }> = {
  album: { icon: "Album", label: "Album" },
  artist: { icon: "Person", label: "Artist" },
  playlist: { icon: "QueueMusic", label: "Playlist" },
};

/** The page's cover and details, with an album's artist and year and a playlist's editable name. */
export const MusicHero = Comp(() => {
  const stores = useStores();
  const store = stores.music.editor;

  const { css } = useClasses(null);

  const album = store.item instanceof MusicAlbum ? store.item : null;
  const cover = store.cover;
  const item = store.item;
  const kind = KINDS[store.kind] ?? KINDS.album;

  const handleOpenArtist = async () => {
    const res = await store.open({ id: album.artistId, kind: "artist" });
    if (!res.success) toast.error(res.error);
  };

  const handleRename = async (name: string) => {
    const res = await stores.music.renamePlaylist({ id: item.id, name });
    if (!res.success) toast.error(res.error);
  };

  return (
    <View
      row
      align="flex-end"
      spacing="1.25rem"
      padding={{ all: "1.25rem 1.5rem 1rem" }}
      bgColor={colors.background}
    >
      <View
        column
        flex="none"
        width="12rem"
        height="12rem"
        overflow="hidden"
        bgColor={colors.foregroundCard}
        borderRadiuses={{ all: MEDIA_PROGRAM_RADIUS }}
        className={css.cover}
      >
        {cover ? (
          <FileBase.Image
            thumb={cover.thumb}
            fileId={cover.id}
            isCorrupted={cover.isCorrupted}
            title={item?.name}
            fit="cover"
          />
        ) : (
          <View column flex={1} align="center" justify="center">
            <Icon name={kind.icon} size="3rem" color={colors.custom.grey} />
          </View>
        )}
      </View>

      {item && (
        <View column flex={1} minWidth={0} spacing="0.5rem">
          <View column align="flex-start">
            <Text color={colors.custom.lightGrey} fontSize="0.85em" fontWeight={600}>
              {kind.label}
            </Text>

            {store.isPlaylist ? (
              <MediaProgramInlineInput
                value={item.name}
                onSave={handleRename}
                fontSize="2em"
                fontWeight={700}
                height="auto"
              >
                <Text fontSize="2em" fontWeight={700} whiteSpace="normal" lineHeight={1.15}>
                  {item.name}
                </Text>
              </MediaProgramInlineInput>
            ) : (
              <Text fontSize="2em" fontWeight={700} whiteSpace="normal" lineHeight={1.15}>
                {item.name}
              </Text>
            )}
          </View>

          <View row wrap="wrap" align="center" className={css.pills}>
            {album && (
              <Button
                {...MEDIA_PROGRAM_BUTTON_PROPS}
                text={album.artistName}
                icon="Person"
                onClick={handleOpenArtist}
              />
            )}

            {album?.year && <Chip label={String(album.year)} />}

            {item.duration > 0 && <Chip label={Fmt.duration(item.duration)} />}

            {item.size > 0 && <Chip label={Fmt.bytes(item.size)} />}
          </View>
        </View>
      )}
    </View>
  );
});

const useClasses = makeClasses({
  cover: {
    boxShadow: "0 0.5rem 1.5rem rgba(0, 0, 0, 0.6)",
  },
  pills: {
    gap: "0.35rem",
  },
});
