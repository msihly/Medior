import { Comp, ImportManager, Ingester, Reingester } from "medior/components";
import { useStores } from "medior/store";

export const ImportModals = Comp(() => {
  const stores = useStores();

  return (
    <>
      <ImportManager />

      {stores.import.ingester.isOpen && <Ingester />}

      {stores.import.reingester.isOpen && <Reingester />}
    </>
  );
});
