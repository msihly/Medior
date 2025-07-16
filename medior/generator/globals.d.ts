import { IndexDefinition, IndexOptions } from "mongoose";
import { IconName, IconProps } from "medior/components/media/icon";

declare global {
  interface FileDef {
    name: string;
    makeFile: () => Promise<string>;
  }

  interface ModelDefProperty {
    defaultValue?: string;
    excludeFromStore?: boolean;
    name: string;
    required?: boolean;
    schemaToStoreName?: string;
    schemaType: string | ModelDefProperty[];
    sort?: { icon: IconName; iconProps?: Partial<IconProps>; label: string };
    storeType?: string;
    type: string;
    typeName?: string;
    withStore?: boolean;
  }

  interface ModelDef {
    defaultPageSize?: number;
    defaultSort: { isDesc: boolean; key: string };
    indexes?: Array<{ fields: IndexDefinition; options?: IndexOptions }>;
    name: string;
    properties: Array<ModelDefProperty>;
    withStore?: boolean;
  }

  interface ModelSearchProp {
    customActionProps?: {
      condition: string;
      name: string;
      objPath: string[];
      objValue: string;
      type: string;
    }[];
    defaultValue: string;
    filterTransform?: string;
    name: string;
    notFilterProp?: boolean;
    notTrackedFilter?: boolean;
    objPath?: string[];
    objValue?: string;
    setter?: string;
    type: string;
  }

  interface ModelSearchStore {
    name: string;
    props: ModelSearchProp[];
    withTags?: boolean;
  }
}

export {};
