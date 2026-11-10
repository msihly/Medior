import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("MusicPlaylist", {
  defaultPageSize: "() => getConfig().music.playlists.search.pageSize",
  defaultSort: "() => getConfig().music.playlists.search.sort",
  withChangeTracking: true,
});

model.addDateRangeProp("dateCreated");
model.addDateRangeProp("dateModified");

model.addLogOpProp("fileCount");
model.addLogOpProp("rating");

model.addProp("name", "string", '""', {
  filterGroup: "name",
  objPath: ["name", "$regex"],
  objValue: "args.name",
});

export const MODEL_SEARCH_STORE_MUSIC_PLAYLIST = model.getModel();
