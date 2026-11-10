import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("MusicArtist", {
  defaultPageSize: "() => getConfig().music.artists.search.pageSize",
  defaultSort: "() => getConfig().music.artists.search.sort",
  withChangeTracking: true,
});

model.addDateRangeProp("dateCreated");
model.addDateRangeProp("dateModified");

model.addLogOpProp("albumCount");
model.addLogOpProp("fileCount");
model.addLogOpProp("rating");

model.addProp("name", "string", '""', {
  filterGroup: "name",
  objPath: ["name", "$regex"],
  objValue: "args.name",
});

export const MODEL_SEARCH_STORE_MUSIC_ARTIST = model.getModel();
