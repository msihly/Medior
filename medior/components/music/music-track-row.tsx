import { Comp, FileBase, MEDIA_PROGRAM_RADIUS, Text, View } from "medior/components";
import { File, FileSearch } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { CONTROL_RADIUS, Fmt, getMusicTrackTitle } from "medior/utils/common";

export interface MusicTrackRowProps {
  /** The files the context menu's carousel goes through. */
  carouselFileIds: string[];
  file: File;
  /** The track's number on its album, or its place in the list. */
  number: number;
  /** Plays the list from the track, which a double click starts. */
  onPlay: (fileId: string) => void;
  /** The search the row selects in. */
  search: FileSearch;
}

/** A track in a list, with its cover, title, artist, album, rating, and length. */
export const MusicTrackRow = Comp(
  ({ carouselFileIds, file, number, onPlay, search }: MusicTrackRowProps) => {
    const isSelected = search.getIsSelected(file.id);
    const title = getMusicTrackTitle(file);

    const { css } = useClasses({ isSelected });

    const handleClick = async (event: React.MouseEvent) => {
      const res = await search.handleSelect({
        hasCtrl: event.ctrlKey,
        hasShift: event.shiftKey,
        id: file.id,
      });

      if (!res?.success) toast.error(res.error);
    };

    const handleDoubleClick = () => onPlay(file.id);

    return (
      <FileBase.ContextMenu file={file} store={search} carouselFileIds={carouselFileIds}>
        <View
          row
          align="center"
          spacing="0.75rem"
          padding={{ all: "0.3rem 0.6rem" }}
          borderRadiuses={{ all: CONTROL_RADIUS }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          className={css.row}
        >
          <Text width="2rem" textAlign="right" color={colors.custom.lightGrey}>
            {number}
          </Text>

          <View
            flex="none"
            width="2.5rem"
            height="2.5rem"
            overflow="hidden"
            borderRadiuses={{ all: MEDIA_PROGRAM_RADIUS }}
          >
            <FileBase.Image
              thumb={file.thumb}
              fileId={file.id}
              isCorrupted={file.isCorrupted}
              title={title}
              fit="cover"
            />
          </View>

          <View column flex={2} minWidth={0}>
            <Text fontWeight={600} tooltip={title}>
              {title}
            </Text>

            {file.music?.artist && (
              <Text color={colors.custom.lightGrey} fontSize="0.8em">
                {file.music.artist}
              </Text>
            )}
          </View>

          <Text flex={1} minWidth={0} color={colors.custom.lightGrey} fontSize="0.85em">
            {file.music?.album}
          </Text>

          <FileBase.RatingChip rating={file.rating} size="small" />

          <Text width="4.5rem" textAlign="right" color={colors.custom.lightGrey}>
            {Fmt.duration(file.duration)}
          </Text>
        </View>
      </FileBase.ContextMenu>
    );
  },
);

interface ClassesProps {
  isSelected: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  row: {
    backgroundColor: props.isSelected ? colors.custom.blue : undefined,
    cursor: "pointer",
    transition: "background-color 150ms ease",
    userSelect: "none",
    "&:hover": {
      backgroundColor: props.isSelected ? colors.custom.blue : colors.control,
    },
  },
}));
