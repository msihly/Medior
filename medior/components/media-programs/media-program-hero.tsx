import { useEffect, useRef, useState } from "react";
import {
  Button,
  ButtonProps,
  Comp,
  FileBase,
  getMediaProgramDetailOptions,
  getWatchStatusMeta,
  Icon,
  ListItem,
  MEDIA_PROGRAM_BUTTON_PROPS,
  MEDIA_PROGRAM_RADIUS,
  MediaProgramInlineInput,
  MediaProgramRating,
  MenuButton,
  Text,
  View,
} from "medior/components";
import { MediaProgramUpdates, useStores } from "medior/store";
import { colors, makeClasses, toast, useElementResize } from "medior/utils/client";
import { MEDIA_PROGRAM_WATCH_STATUSES, MediaProgramWatchStatus } from "medior/utils/common";

const DESCRIPTION_LINES = 3;

/**
 * The program's poster and details over its blurred backdrop, like a streaming site's title page.
 * Its name, watch status, rating, year, and classification are edited where they're shown.
 */
export const MediaProgramHero = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram.editor;
  const settings = stores.home.settings.mediaPrograms;

  const [isDescriptionClamped, setIsDescriptionClamped] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const descriptionRef = useRef<HTMLDivElement>(null);

  const { css } = useClasses({ isDescriptionExpanded });

  const program = store.program;
  const meta = program?.meta;
  // Programs without metadata show the first episode of the active season's page.
  const episodeFile = store.search.results[0];
  const posterPath = meta?.posterPath ?? store.activeSeason?.meta?.posterPath;
  const backdropPath = meta?.bannerPath ?? posterPath;
  const watchStatus = program && getWatchStatusMeta(program.watchStatus, program.isRewatching);

  const descriptionDims = useElementResize(descriptionRef, meta?.description);

  /** Show More appears only while the line clamp hides part of the description. */
  useEffect(() => {
    const element = descriptionRef.current;
    if (element && !isDescriptionExpanded)
      setIsDescriptionClamped(element.scrollHeight > element.clientHeight);
  }, [descriptionDims, isDescriptionExpanded, meta?.description]);

  const handleLanguage = (language: string) => handleUpdate({ language });

  const handleMedium = (medium: string) => handleUpdate({ medium });

  const handleName = (name: string) => handleUpdate({ name });

  const handleRating = (rating: number) => handleUpdate({ rating });

  const handleType = (type: string) => handleUpdate({ type });

  const handleUpdate = async (updates: MediaProgramUpdates) => {
    const res = await stores.mediaProgram.updateMediaProgram({ id: program.id, updates });
    if (!res.success) toast.error(res.error);
  };

  const handleWatchStatus = (watchStatus: MediaProgramWatchStatus) => handleUpdate({ watchStatus });

  const handleYear = (value: string) => {
    const year = value ? Number(value) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1800 || year > 9999))
      toast.error("Enter a year from 1800 to 9999.");
    else handleUpdate({ year });
  };

  const toggleDescription = () => setIsDescriptionExpanded(!isDescriptionExpanded);

  return (
    <View position="relative" flex="none" overflow="hidden" bgColor={colors.background}>
      {backdropPath && (
        <View position="absolute" opacity={0.4} className={css.backdrop}>
          <FileBase.Image thumb={{ path: backdropPath }} title="" fit="cover" blur={14} />
        </View>
      )}

      <View position="absolute" className={css.shade} />

      <View
        row
        align="flex-end"
        spacing="1.25rem"
        position="relative"
        padding={{ all: "1.25rem 1.5rem 1rem" }}
      >
        <View
          column
          flex="none"
          width="10rem"
          height="15rem"
          overflow="hidden"
          bgColor={colors.foregroundCard}
          borderRadiuses={{ all: MEDIA_PROGRAM_RADIUS }}
          className={css.poster}
        >
          {posterPath ? (
            <FileBase.Image thumb={{ path: posterPath }} title={program?.name} fit="cover" />
          ) : episodeFile ? (
            <FileBase.Image
              thumb={episodeFile.thumb}
              fileId={episodeFile.id}
              isCorrupted={episodeFile.isCorrupted}
              title={program?.name}
              fit="cover"
            />
          ) : (
            <View column flex={1} align="center" justify="center">
              <Icon name="LiveTv" size="3rem" color={colors.custom.grey} />
            </View>
          )}
        </View>

        {program && (
          <View column flex={1} minWidth={0} spacing="0.5rem">
            <View column align="flex-start">
              <MediaProgramInlineInput
                value={program.name}
                onSave={handleName}
                fontSize="2em"
                fontWeight={700}
                height="auto"
              >
                <Text fontSize="2em" fontWeight={700} whiteSpace="normal" lineHeight={1.15}>
                  {program.name}
                </Text>
              </MediaProgramInlineInput>

              {meta?.title && meta.title !== program.name && (
                <Text color={colors.custom.lightGrey} fontSize="0.95em" whiteSpace="normal">
                  {meta.title}
                </Text>
              )}
            </View>

            <View row wrap="wrap" align="center" className={css.pills}>
              <OptionButton
                options={[...MEDIA_PROGRAM_WATCH_STATUSES]}
                value={program.watchStatus}
                setValue={handleWatchStatus}
                label={watchStatus.label}
                color={watchStatus.bgColor}
                icon={watchStatus.icon}
                textColor={colors.custom.white}
              />

              <MediaProgramRating rating={program.rating} setRating={handleRating} />

              <MediaProgramInlineInput
                value={program.year ? String(program.year) : ""}
                onSave={handleYear}
                width="6rem"
              >
                <Button
                  {...MEDIA_PROGRAM_BUTTON_PROPS}
                  text={program.year ? String(program.year) : "Add Year"}
                  icon="CalendarMonth"
                  textColor={program.year ? undefined : colors.custom.lightGrey}
                />
              </MediaProgramInlineInput>

              <OptionButton
                options={getMediaProgramDetailOptions(settings.types, program.type)}
                value={program.type}
                setValue={handleType}
                placeholder="Add Type"
                icon="Category"
              />

              <OptionButton
                options={getMediaProgramDetailOptions(settings.mediums, program.medium)}
                value={program.medium}
                setValue={handleMedium}
                placeholder="Add Medium"
                icon="Brush"
              />

              <OptionButton
                options={getMediaProgramDetailOptions(settings.languages, program.language)}
                value={program.language}
                setValue={handleLanguage}
                placeholder="Add Language"
                icon="Translate"
              />
            </View>

            {meta?.description && (
              <View column align="flex-start">
                <View ref={descriptionRef} className={css.description}>
                  <Text
                    color={colors.custom.lightGrey}
                    fontSize="0.9em"
                    whiteSpace="pre-line"
                    lineHeight={1.5}
                  >
                    {meta.description}
                  </Text>
                </View>

                {(isDescriptionExpanded || isDescriptionClamped) && (
                  <Button
                    type="link"
                    text={isDescriptionExpanded ? "Show Less" : "Show More"}
                    onClick={toggleDescription}
                    fontSize="0.85em"
                  />
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
});

interface OptionButtonProps extends Pick<ButtonProps, "color" | "icon" | "textColor"> {
  /** Shown in place of the chosen option's label. */
  label?: string;
  options: { label: string; value: string }[];
  /** Shown when nothing is chosen, with a None option to clear the choice. */
  placeholder?: string;
  setValue: (value: string) => void;
  value: string;
}

const OptionButton = Comp(
  ({ label, options, placeholder, setValue, value, ...buttonProps }: OptionButtonProps) => (
    <MenuButton
      button={(onOpen) => (
        <Button
          {...MEDIA_PROGRAM_BUTTON_PROPS}
          {...buttonProps}
          text={label ?? options.find((option) => option.value === value)?.label ?? placeholder}
          textColor={buttonProps.textColor ?? (value ? undefined : colors.custom.lightGrey)}
          onClick={onOpen}
        />
      )}
    >
      {(onClose) => [
        ...options.map((option) => (
          <ListItem
            key={option.value}
            text={option.label}
            iconEnd={option.value === value ? "Check" : undefined}
            onClick={() => {
              onClose();
              setValue(option.value);
            }}
          />
        )),
        ...(placeholder && value
          ? [
              <ListItem
                key="none"
                text="None"
                color={colors.custom.lightGrey}
                onClick={() => {
                  onClose();
                  setValue(null);
                }}
              />,
            ]
          : []),
      ]}
    </MenuButton>
  ),
);

interface ClassesProps {
  isDescriptionExpanded: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  backdrop: {
    inset: "-2rem",
  },
  description: {
    display: "-webkit-box",
    maxWidth: "56rem",
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: props.isDescriptionExpanded ? "unset" : DESCRIPTION_LINES,
  },
  pills: {
    gap: "0.35rem",
  },
  poster: {
    boxShadow: "0 0.5rem 1.5rem rgba(0, 0, 0, 0.6)",
  },
  shade: {
    inset: 0,
    background: `linear-gradient(to bottom, rgba(0, 0, 0, 0.15), ${colors.background} 92%)`,
  },
}));
