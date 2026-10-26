import path from "path";

export {
  createFiles,
  makeFilterQueryType,
  makeSectionComment,
  makeServerEndpointDefs,
  makeSocketDefs,
  makeStoreDefaultValue,
  parseExportsFromIndex,
} from "trabecula/utils/generator";

export const ROOT_PATH = path.resolve("./medior");
