import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("MusicAlbum", {
  defaultPageSize: "() => getConfig().music.albums.search.pageSize",
  defaultSort: "() => getConfig().music.albums.search.sort",
  withChangeTracking: true,
});

model.addDateRangeProp("dateCreated");
model.addDateRangeProp("dateModified");

model.addLogOpProp("fileCount");
model.addLogOpProp("rating");

model.addNumRangeProp("year");

/** Limits the albums to an artist's, such as on their page. */
model.addProp("artistIds", "string[]", "() => []", {
  objPath: ["artistId", "$in"],
  objValue: "objectIds(args.artistIds)",
});

model.addProp("artistName", "string", '""', {
  filterGroup: "artistName",
  objPath: ["artistName", "$regex"],
  objValue: "args.artistName",
});

model.addProp("name", "string", '""', {
  filterGroup: "name",
  objPath: ["name", "$regex"],
  objValue: "args.name",
});

export const MODEL_SEARCH_STORE_MUSIC_ALBUM = model.getModel();
