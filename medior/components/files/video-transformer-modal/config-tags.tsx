import { useEffect, useRef, useState } from "react";
import { Comp, TagInput } from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import { toast } from "medior/utils/client";

export const ConfigTags = Comp(({ configKey, label }: { configKey: string; label: string }) => {
  const stores = useStores();
  const store = stores.home.settings;

  const ids = store.getConfigByKey<string[]>(configKey as any) ?? [];

  const [value, setValue] = useState<TagOption[]>([]);
  const lookupId = useRef(0);

  useEffect(() => {
    const requestId = ++lookupId.current;

    (async () => {
      try {
        if (!ids.length) return setValue([]);

        const tags = await stores.tag.listByIds({ ids });
        if (requestId !== lookupId.current) return;
        if (!tags.success) throw new Error(tags.error);

        setValue(tags.data.map(tagToOption));
      } catch (error) {
        if (requestId === lookupId.current) toast.error(error);
      }
    })();

    return () => {
      lookupId.current++;
    };
  }, [configKey, ids.join("|")]);

  const handleChange = (tags: TagOption[]) => {
    lookupId.current++;
    setValue(tags);
    store.update({ [configKey]: tags.map((tag) => tag.id) });
  };

  return <TagInput header={label} value={value} onChange={handleChange} width="100%" hasCreate />;
});
