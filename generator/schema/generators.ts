import { makeSectionComment } from "generator/utils";

export class ModelDb {
  private defaultPageSize: ModelDef["defaultPageSize"];
  private defaultSort: ModelDef["defaultSort"];
  private indexes: ModelDef["indexes"] = [];
  private name: ModelDef["name"];
  private properties: ModelDef["properties"] = [];
  private withStore: ModelDef["withStore"];

  constructor(
    name: string,
    options?: Partial<Omit<ModelDef, "indexes" | "name" | "properties">> & { noCommon?: boolean }
  ) {
    this.name = name;
    this.defaultPageSize = options?.defaultPageSize;
    this.defaultSort = options?.defaultSort ?? { isDesc: true, key: "dateCreated" };
    this.withStore = options?.withStore;

    this.addProp("id", "string", { required: true });

    if (!options.noCommon) {
      this.addIndex({ dateCreated: 1, _id: 1 });
      this.addProp("dateCreated", "string", {
        defaultValue: "dayjs().toISOString()",
        required: true,
        sort: { icon: "DateRange", label: "Date Created" },
      });
    }
  }

  public addIndex(
    fields: ModelDef["indexes"][number]["fields"],
    options: ModelDef["indexes"][number]["options"] = { unique: true }
  ) {
    this.indexes.push({ fields, options });
  }

  public addProp(...args: Parameters<typeof this.makeProp>) {
    this.properties.push(this.makeProp(...args));
  }

  public getModel() {
    return {
      name: this.name,
      defaultPageSize: this.defaultPageSize,
      defaultSort: this.defaultSort,
      indexes: this.indexes,
      properties: this.properties,
      withStore: this.withStore,
    };
  }

  public makeProp = (
    name: string,
    type: string,
    props: Omit<ModelDefProperty, "name" | "schemaType" | "type"> & {
      schemaType?: ModelDefProperty["schemaType"];
    } = {}
  ) => {
    return {
      ...props,
      name,
      schemaType: props.schemaType ?? this.makeSchemaType(type),
      type: this.makeType(type),
    };
  };

  public makeSchemaType = (type: string) => {
    let schemaType: string;
    if (type.includes("boolean")) schemaType = "Boolean";
    if (type.includes("number")) schemaType = "Number";
    if (type.includes("string")) schemaType = "String";
    if (type.includes(".id"))
      schemaType = `{ type: Schema.Types.ObjectId, ref: "${type.split(".")[0]}" }`;
    if (type.startsWith("Array<") || type.endsWith("[]")) schemaType = `[${schemaType}]`;
    return schemaType;
  };

  public makeType = (type: string) => {
    if (!type.includes(".id")) return type;
    return type.startsWith("Array<") || type.endsWith("[]") ? "string[]" : "string";
  };
}

const makeInterfacesAndSchemaProps = (modelDef: ModelDef, schemaName: string) => {
  const { interfaces, schemaProps } = modelDef.properties.reduce(
    (acc, cur) => {
      if (typeof cur.schemaType === "string")
        acc.schemaProps.push(`${cur.name}: ${cur.schemaType},`);
      else {
        acc.interfaces.push(
          `export interface ${cur.typeName} { ${cur.schemaType.map((p) => `${p.name}: ${p.type};`).join("\n")} }`
        );
        acc.schemaProps.push(
          `${cur.name}: [{ ${cur.schemaType.map((p) => `${p.name}: ${p.schemaType}`)} }],`
        );
      }
      return acc;
    },
    { interfaces: [], schemaProps: [] } as { interfaces: string[]; schemaProps: string[] }
  );

  interfaces.push(`export interface ${schemaName} {
    ${modelDef.properties
      .map((prop) => `${prop.name}${prop.required ? "" : "?"}: ${prop.type};`)
      .join("\n")}
  }`);

  return { interfaces, schemaProps };
};

const makeModel = (modelDef: ModelDef, schemaName: string) =>
  `export const ${modelDef.name}Model = model<${schemaName}>("${modelDef.name}", ${schemaName});`;

const makeSchemaDef = (schemaName: string, schemaProps: string[]) =>
  `const ${schemaName} = new Schema<${schemaName}>({ ${schemaProps.join("\n")} });`;

const makeSchemaIndexes = (modelDef: ModelDef, schemaName: string) =>
  `${
    !modelDef.indexes
      ? ""
      : modelDef.indexes
          .map(
            (index) =>
              `${schemaName}.index(${JSON.stringify(index.fields)}, ${JSON.stringify(index.options)});`
          )
          .join("\n")
  }`;

export const makeModelDef = (modelDef: ModelDef) => {
  const schemaName = `${modelDef.name}Schema`;

  const { interfaces, schemaProps } = makeInterfacesAndSchemaProps(modelDef, schemaName);

  return `${makeSectionComment(modelDef.name)}\n
    ${interfaces.join("\n\n")}\n
    ${makeSchemaDef(schemaName, schemaProps)}\n
    ${makeSchemaIndexes(modelDef, schemaName)}\n
    ${makeModel(modelDef, schemaName)}`;
};
