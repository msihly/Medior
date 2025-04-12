import { getActions } from "medior/generator/actions/generators";
import { capitalize, makeSectionComment } from "medior/generator/utils";

export class ModelStore {
  private name: ModelSearchStore["name"];
  private props: ModelSearchStore["props"] = [];

  constructor(
    name: ModelSearchStore["name"],
    options: { defaultPageSize: string; defaultSort: string }
  ) {
    this.name = name;
    this.addProp("forcePages", "boolean", "false", { notFilterProp: true });
    this.addProp("hasChanges", "boolean", "false", { notFilterProp: true });
    this.addProp("ids", "string[]", "() => []", {
      objPath: ["_id", "$in"],
      objValue: "objectIds(args.ids)",
    });
    this.addProp("isLoading", "boolean", "false", { notFilterProp: true });
    this.addProp("isPageCountLoading", "boolean", "false", { notFilterProp: true });
    this.addProp("page", "number", "1", { notFilterProp: true });
    this.addProp("pageCount", "number", "1", { notFilterProp: true });
    this.addProp("pageSize", "number", options.defaultPageSize, { notFilterProp: true });
    this.addProp("results", `Stores.${this.name}[]`, "() => []", { notFilterProp: true });
    this.addProp("selectedIds", "string[]", "() => []", { notFilterProp: true });
    this.addProp("sortValue", "SortMenuProps['value']", options.defaultSort);
  }

  public addProp(...args: Parameters<typeof this.makeProp>) {
    this.props.push(this.makeProp(...args));
  }

  public addDateRangeProp(name: string) {
    this.addProp(`${name}End`, "string", '""', {
      objPath: [name, "$lte"],
      objValue: `args.${name}End`,
    });
    this.addProp(`${name}Start`, "string", '""', {
      objPath: [name, "$gte"],
      objValue: `args.${name}Start`,
    });
  }

  public addLogOpProp(
    name: string,
    options: { objPath?: ModelSearchProp["objPath"]; objValue?: ModelSearchProp["objValue"] } = {}
  ) {
    this.addProp(
      name,
      "{ logOp: LogicalOp | '', value: number }",
      "() => ({ logOp: '', value: 0 })",
      {
        objPath: [name, `~logicOpsToMongo(args.${name}.logOp)`],
        objValue: `args.${name}.value`,
        setter: `${this.makeSetterProp(`${name}Op`, ["val: LogicalOp | ''"], `this.${name}.logOp = val;`)}\n
            ${this.makeSetterProp(`${name}Value`, ["val: number"], `this.${name}.value = val;`)}`,
        ...options,
      }
    );
  }

  public addTagOptsProp(idName: string, ancestorsName: string) {
    return this.addProp("tags", "Stores.TagOption[]", "() => []", {
      filterTransform:
        "...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags)",
      customActionProps: [
        this.makeCustomActionProp("excludedDescTagIds", "string[]", {
          condition: "args.excludedDescTagIds?.length",
          objPath: [ancestorsName, "$nin"],
          objValue: "objectIds(args.excludedDescTagIds)",
        }),
        this.makeCustomActionProp("excludedTagIds", "string[]", {
          condition: "args.excludedTagIds?.length",
          objPath: [idName, "$nin"],
          objValue: "objectIds(args.excludedTagIds)",
        }),
        this.makeCustomActionProp("optionalTagIds", "string[]", {
          condition: "args.optionalTagIds?.length",
          objPath: [idName, "$in"],
          objValue: "objectIds(args.optionalTagIds)",
        }),
        this.makeCustomActionProp("requiredDescTagIds", "string[]", {
          condition: "args.requiredDescTagIds?.length",
          objPath: [ancestorsName, "$all"],
          objValue: "objectIds(args.requiredDescTagIds)",
        }),
        this.makeCustomActionProp("requiredTagIds", "string[]", {
          condition: "args.requiredTagIds?.length",
          objPath: [idName, "$all"],
          objValue: "objectIds(args.requiredTagIds)",
        }),
      ],
    });
  }

  public getModel() {
    return { name: this.name, props: this.props };
  }

  public makeCustomActionProp(
    name: string,
    type: string,
    args: Omit<ModelSearchProp["customActionProps"][number], "name" | "type">
  ) {
    return { ...args, name, type };
  }

  public makeProp(
    name: string,
    type: string,
    defaultValue: string,
    props: Omit<ModelSearchProp, "defaultValue" | "name" | "type"> = {}
  ) {
    return { ...props, defaultValue, name, type };
  }

  public makeSetterProp(name: string, args: string[], body: string) {
    return `@modelAction\nset${capitalize(name)}(${args.join(", ")}) {\n${body}\n}`;
  }
}

const createSchemaItem = (storeName: string, props: ModelDefProperty[]) => {
  const makeProps = () =>
    props
      .map((prop) => `${prop.name}: prop<${prop.storeType || prop.type}>(${getDefaultValue(prop)})`)
      .join(",\n");

  const makeUpdateAction = () =>
    `@modelAction
    update(updates: Partial<ModelCreationData<this>>) {
      applySnapshot(this, { ...getSnapshot(this), ...updates });
    }`;

  return `@model("medior/_${storeName}")
    export class _${storeName} extends Model({ ${makeProps()} }) {
      ${makeUpdateAction()}
    }`;
};

const createSchemaStore = async (modelDef: ModelDef) => {
  const upperName = modelDef.name;
  const schemaStoreMap = await makeSchemaStoreMap(upperName);
  const storeName = `_${upperName}Store`;

  const makeAsyncAction = (type: string, args: { fnName: string; typeName: string }) =>
    `@modelFlow\n${type}${upperName} = asyncAction(async (args: Types.${args.typeName}) => {
      this.setIsLoading(true);
      const res = await trpc.${args.fnName}.mutate({ args });
      this.setIsLoading(false);
      if (res.error) throw new Error(res.error);
      return res.data;
    });`;

  const makeProps = () => `isLoading: prop<boolean>(false).withSetter()`;

  return `@model("medior/${storeName}")
    export class ${storeName} extends Model({ ${makeProps()} }) {
      /* ------------------------------ ASYNC ACTIONS ----------------------------- */
      ${makeAsyncAction("create", schemaStoreMap.create)}\n
      ${makeAsyncAction("delete", schemaStoreMap.delete)}\n
      ${makeAsyncAction("update", schemaStoreMap.update)}\n
    }`;
};

export const createSearchStore = (def: ModelSearchStore) => {
  const props = [...def.props].sort((a, b) => a.name.localeCompare(b.name));
  const storeName = `_${def.name}Search`;

  const makeProps = () =>
    props
      .map(
        (prop) =>
          `${prop.name}: prop<${prop.type}>(${prop.defaultValue})${!prop.setter ? ".withSetter()" : ""}`
      )
      .join(",\n");

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  const makeCustomSetters = () =>
    props
      .filter((prop) => prop.setter)
      .map((prop) => prop.setter)
      .join("\n\n");

  const makeAddResultAction = () =>
    `@modelAction\n_addResult(result: ModelCreationData<Stores.${def.name}>) { this.results.push(new Stores.${def.name}(result)); }`;

  const makeDeleteResultsAction = () =>
    `@modelAction\n_deleteResults(ids: string[]) { this.results = this.results.filter((d) => !ids.includes(d.id)); }`;

  const makeResetAction = () =>
    `@modelAction\nreset() { ${props.map((prop) => `this.${prop.name} = ${prop.defaultValue.replace("() => ", "")};`).join("\n")} }`;

  const makeToggleSelectedAction = () =>
    `@modelAction
    toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
      if (!selected?.length) return;

      const [added, removed] = selected.reduce(
        (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
        [[], []]
      );

      const removedSet = new Set(removed);
      this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter((id) => !removedSet.has(id));

      if (withToast) {
        const addedCount = added.length;
        const removedCount = removed.length;
        if (addedCount && removedCount) toast.success(\`Selected \${addedCount} items and deselected \${removedCount} items\`);
        else if (addedCount) toast.success(\`Selected \${addedCount} items\`);
        else if (removedCount) toast.success(\`Deselected \${removedCount} items\`);
      }
    }`;

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  const makeGetShiftSelectedAction = () =>
    `@modelFlow
    getShiftSelected = asyncAction(
      async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
        const clickedIndex = (this.page - 1) * this.pageSize + this.results.findIndex((r) => r.id === id);

        const res = await trpc.getShiftSelected${def.name}.mutate({
          ...this.getFilterProps(),
          clickedId: id,
          clickedIndex,
          selectedIds,
        });
        if (!res.success) throw new Error(res.error);
        return res.data;
      }
    );`;

  const makeHandleSelectAction = () =>
    `@modelFlow
    handleSelect = asyncAction(async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });
        if (!res?.success) throw new Error(res.error);
        this.toggleSelected([
          ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
          ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
        ]);
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else {
        this.toggleSelected([
          ...this.selectedIds.map((id) => ({ id, isSelected: false })),
          { id, isSelected: true },
        ]);
      }
    });`;

  const makeLoadFilteredAction = () =>
    `@modelFlow
    loadFiltered = asyncAction(async ({ page }: { page?: number } = {}) => {
      const debug = false;
      const { perfLog } = makePerfLog("[${def.name}Search]");
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      const itemsRes = await trpc.listFiltered${def.name}.mutate({
        ...this.getFilterProps(),
        forcePages: this.forcePages,
        page: page ?? this.page,
        pageSize: this.pageSize,
      });
      if (!itemsRes.success) throw new Error(itemsRes.error);
      const items = itemsRes.data;
      if (debug) perfLog(\`Loaded \${items.length} items\`);

      this.setResults(items.map((item) => new Stores.${def.name}(item)));
      if (debug) perfLog("Overwrite and re-render");

      if (page) this.setPage(page);
      if (debug && page) perfLog(\`Set page to \${page ?? this.page}\`)
      this.setIsLoading(false);
      this.setHasChanges(false);

      const countRes = await trpc.getFiltered${def.name}Count.mutate({ ...this.getFilterProps(), pageSize: this.pageSize });
      if (!countRes.success) throw new Error(countRes.error);
      const pageCount = countRes.data.pageCount;
      this.setPageCount(pageCount);
      this.setIsPageCountLoading(false);
      if (debug) perfLog(\`Set pageCount to \${pageCount}\`);

      return items;
    });`;

  /* --------------------------------- GETTERS -------------------------------- */
  const makeFilterPropsGetter = () =>
    `getFilterProps() {
      return {
        ${props
          .filter((prop) => !prop.notFilterProp)
          .map((prop) => prop.filterTransform ?? `${prop.name}: this.${prop.name}`)
          .join(",\n")}
      };
    }`;

  const makeIsSelectedGetter = () =>
    `getIsSelected(id: string) { return !!this.selectedIds.find((s) => s === id); }`;

  const makeNumOfFiltersGetter = () =>
    `@computed
    get numOfFilters() {
      return (
        ${props
          .filter((prop) => !(prop.notFilterProp || prop.notTrackedFilter))
          .map(
            (prop) =>
              `(!isDeepEqual(this.${prop.name}, ${prop.defaultValue.replace("() => ", "")}) ? 1 : 0)`
          )
          .join(" +\n")}
      );
    }`;

  const makeResultGetter = () =>
    `getResult(id: string) { return this.results.find((r) => r.id === id); }`;

  return `@model("medior/${storeName}")
    export class ${storeName} extends Model({ ${makeProps()} }) {
      /* STANDARD ACTIONS */
      ${makeAddResultAction()}\n
      ${makeDeleteResultsAction()}\n
      ${makeResetAction()}\n
      ${makeToggleSelectedAction()}\n
      ${makeCustomSetters()}\n
      /* ASYNC ACTIONS */
      ${makeGetShiftSelectedAction()}\n
      ${makeHandleSelectAction()}\n
      ${makeLoadFilteredAction()}\n
      /* GETTERS */
      ${makeNumOfFiltersGetter()}\n
      /* DYNAMIC GETTERS */
      ${makeFilterPropsGetter()}\n
      ${makeIsSelectedGetter()}\n
      ${makeResultGetter()}
    }`;
};

const getDefaultValue = (prop: ModelDefProperty) => {
  if (prop.defaultValue)
    return /^([{\[]|dayjs\(\))/.test(prop.defaultValue)
      ? `() => ${prop.defaultValue}`
      : prop.defaultValue;
  else return prop.required ? "" : "null";
};

const makeFnAndTypeNames = (modelActions: string[], rawName: string) => {
  const prefix = `${modelActions.includes(rawName) ? "" : "_"}`;
  return { fnName: `${prefix}${rawName}`, typeName: `${prefix}${capitalize(rawName)}Input` };
};

const makeSchemaStoreMap = async (upperName: string) => {
  const actions = await getActions();

  return {
    create: makeFnAndTypeNames(actions.model, `create${upperName}`),
    delete: makeFnAndTypeNames(actions.model, `delete${upperName}`),
    list: makeFnAndTypeNames(actions.model, `list${upperName}`),
    update: makeFnAndTypeNames(actions.model, `update${upperName}`),
  };
};

export const makeSortDef = (modelDef: ModelDef) => {
  return `"${modelDef.name}": [${modelDef.properties
    .filter((prop) => prop.sort)
    .map(
      (prop) =>
        `{ attribute: "${prop.name}",
           icon: "${prop.sort.icon}",${prop.sort.iconProps ? ` iconProps: ${JSON.stringify(prop.sort.iconProps)},` : ""}
           label: "${prop.sort.label}" }`
    )
    .join(", ")}]`;
};

export const makeStoreDef = async (modelDef: ModelDef) => {
  const upperName = modelDef.name;
  const includedProps = modelDef.properties.filter((prop) => !prop.excludeFromStore);
  const schemaToStoreProps = modelDef.properties.filter((prop) => prop.schemaToStoreName);

  const makeSchemaStores = () =>
    schemaToStoreProps
      .map((prop) =>
        createSchemaItem(prop.schemaToStoreName, prop.schemaType as ModelDefProperty[])
      )
      .join("\n");

  return `${makeSectionComment(upperName)}\n
    ${createSchemaItem(upperName, includedProps)}\n
    ${makeSchemaStores()}\n
    ${await createSchemaStore(modelDef)}`;
};
