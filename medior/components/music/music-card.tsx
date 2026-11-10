import { Comp, FileBase, Icon, IconName, POSTER_FOOTER_BACKGROUND, View } from "medior/components";
import { File } from "medior/store";
import { colors } from "medior/utils/client";

export interface MusicCardProps {
  /** The corner chip's label, such as the track count. */
  chip: string;
  /** The file whose cover art or thumbnail the card shows. */
  cover: File | undefined;
  details: string;
  /** Shown in place of a cover. */
  icon: IconName;
  isSelected: boolean;
  name: string;
  onOpen: () => void;
  onSelect: (event: React.MouseEvent) => void;
  rating: number;
}

/**
 * An album, artist, playlist, or track laid out like a media program card, with its cover art. Its
 * caller wraps it in the context menu for what it shows.
 */
export const MusicCard = Comp(
  ({ chip, cover, details, icon, isSelected, name, onOpen, onSelect, rating }: MusicCardProps) => (
    <FileBase.Container
      height="17rem"
      onClick={onSelect}
      onDoubleClick={onOpen}
      selected={isSelected}
    >
      {cover ? (
        <FileBase.Image
          thumb={cover.thumb}
          fileId={cover.id}
          isCorrupted={cover.isCorrupted}
          title={name}
          fit="cover"
        />
      ) : (
        <View column flex={1} align="center" justify="center">
          <Icon name={icon} size="3rem" color={colors.custom.grey} />
        </View>
      )}

      <FileBase.RatingChip position="top-left" rating={rating} size="small" />

      <FileBase.Chip position="top-right" size="small" label={chip} />

      <FileBase.Footer height="5.5rem" background={POSTER_FOOTER_BACKGROUND}>
        <View column width="100%" overflow="hidden">
          <FileBase.FooterText text={name} textProps={{ fontWeight: 600 }} />

          <FileBase.FooterText
            text={details}
            textProps={{ color: colors.custom.lightGrey, fontSize: "0.75em" }}
          />
        </View>
      </FileBase.Footer>
    </FileBase.Container>
  ),
);
