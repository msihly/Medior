import type { FileSchema, MediaProgramSchema } from "medior/_generated/server/models";
import { Fmt } from "trabecula/utils/common";
import type { SubtitleSegment } from "./subtitles";

/**
 * What a file translation covers: its name, its transcript, a companion subtitle file by its path
 * key, or a text subtitle stream by its index.
 */
export type FileTranslationSource =
  "name" | "transcript" | `stream:${number}` | `subtitle:${string}`;

/** Which of a name and its saved translation shows on file cards. */
export type TranslationDisplay = "original" | "translation";

/** Timed cues as the info and translation modals list them. */
export const formatCaptionSegments = (segments: SubtitleSegment[]) =>
  segments
    .map(({ end, start, text }) => `[${Fmt.duration(start)} – ${Fmt.duration(end)}] ${text.trim()}`)
    .join("\n\n");

export const getCaptionTranslation = (
  file: Pick<FileSchema, "captionTranslations">,
  source: string,
  language: string,
) =>
  file?.captionTranslations?.find(
    (translation) => translation.language === language && translation.source === source,
  );

/** The name's translation, unless the file has been renamed since. */
export const getNameTranslation = (
  file: Pick<FileSchema, "nameTranslations" | "originalName">,
  language: string,
) =>
  file?.nameTranslations?.find(
    (translation) => translation.language === language && translation.name === file.originalName,
  );

/** The program's translation of an episode title from its metadata, if it has one. */
export const getTitleTranslation = (
  program: Pick<MediaProgramSchema, "titleTranslations">,
  title: string,
  language: string,
) =>
  program?.titleTranslations?.find(
    (translation) => translation.language === language && translation.title === title,
  );
