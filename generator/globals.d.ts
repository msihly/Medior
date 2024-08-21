import { IndexDefinition, IndexOptions } from "mongoose";
import { IconName } from "medior/components/media/icon";

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
    sort?: { icon: IconName; label: string };
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
}

export {};
