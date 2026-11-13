import { promises as fs } from "fs";
import path from "path";
import * as models from "medior/_generated/server/models";
import { fileLog } from "trabecula/utils/server";
import { MediaProgramSeason } from "medior/utils/common";

/** The folders holding a program's downloaded images, one per metadata download. */
const getMediaProgramImageFolders = (
  program: Pick<models.MediaProgramSchema, "meta" | "seasons">,
) => {
  const imagePaths = [
    program.meta?.bannerPath,
    program.meta?.posterPath,
    ...(program.meta?.seasons ?? []).flatMap((season) => [
      season.posterPath,
      ...(season.episodes ?? []).map((episode) => episode.stillPath),
    ]),
    ...(program.seasons ?? []).flatMap((season) => [
      season.meta?.posterPath,
      ...(season.meta?.episodes ?? []).map((episode) => episode.stillPath),
    ]),
  ];

  return [...new Set(imagePaths.filter(Boolean).map((imagePath) => path.dirname(imagePath)))];
};

/** Seasons as stored, with string IDs and every field present. */
export const readMediaProgramSeasons = (
  seasons: models.MediaProgramSchema["seasons"],
): MediaProgramSeason[] =>
  (seasons ?? []).map((season) => ({
    // Seasons saved before episodes had numbers count up from 1.
    episodeNumbers: season.episodeNumbers ?? {},
    fileIds: season.fileIds.map(String),
    id: String(season.id),
    label: season.label ?? "",
    meta: season.meta ?? null,
    number: season.number ?? null,
    rating: season.rating ?? 0,
    ratingIsManual: !!season.ratingIsManual,
  }));

/** Removes a program's image folder unless another download is still inside it. */
export const removeMediaProgramImageFolder = async (folderPath: string) => {
  try {
    await fs.rmdir(folderPath);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes(error.code))
      fileLog(`Failed to delete media program image folder ${folderPath}: ${error.message}`, {
        type: "error",
      });
  }
};

/**
 * Deletes the images downloaded for the programs' metadata, then each program's image folder once
 * it holds no other download.
 */
export const removeMediaProgramImages = async (
  programs: Pick<models.MediaProgramSchema, "meta" | "seasons">[],
) => {
  const folderPaths = programs.flatMap(getMediaProgramImageFolders);

  for (const folderPath of folderPaths) {
    try {
      await fs.rm(folderPath, { force: true, recursive: true });
    } catch (error) {
      fileLog(`Failed to delete media program images in ${folderPath}: ${error.message}`, {
        type: "error",
      });
    }
  }

  for (const programFolderPath of new Set(folderPaths.map((folder) => path.dirname(folder))))
    await removeMediaProgramImageFolder(programFolderPath);
};
