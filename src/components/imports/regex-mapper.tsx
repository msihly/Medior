import { observer } from "mobx-react-lite";
import { RegExMap, useStores } from "store";
import { Accordion, AccordionProps, Button, Modal, Text, View } from "components";
import { RegExMapRow } from ".";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

export const ImportRegExMapper = observer(() => {
  const { importStore } = useStores();

  const hasUnsavedChanges = importStore.regExMaps.some((map) => map.hasUnsavedChanges);

  const handleClose = () => {
    importStore.setIsImportRegExMapperOpen(false);
    importStore.loadRegExMaps();
  };

  const handleSave = async () => {
    await importStore.saveRegExMaps();
    await importStore.loadRegExMaps();
    toast.success("RegEx mappings saved!");
  };

  return (
    <Modal.Container onClose={handleClose} width="100%" height="100%">
      <Modal.Header>
        <Text>{"Import RegEx Mapper"}</Text>
      </Modal.Header>

      <Modal.Content>
        <TypeAccordion header="Diffusion to Tags" type="diffusionToTags" />

        <TypeAccordion header="File to Tags" type="fileToTags" />

        <TypeAccordion header="Folder to Collection" type="folderToCollection" />

        <TypeAccordion header="Folder to Tags" type="folderToTags" />
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Close"
          icon="Close"
          onClick={handleClose}
          color={hasUnsavedChanges ? colors.button.red : colors.button.grey}
        />

        <Button text="Save" icon="Save" onClick={handleSave} disabled={!hasUnsavedChanges} />
      </Modal.Footer>
    </Modal.Container>
  );
});

interface TypeAccordionProps {
  header: AccordionProps["header"];
  type: RegExMap["type"];
}

const TypeAccordion = observer(({ header, type }: TypeAccordionProps) => {
  const { css } = useClasses(null);

  const { importStore } = useStores();

  const regExMaps = importStore.listRegExMapsByType(type);

  const handleAdd = () => importStore.addRegExMap(type);

  return (
    <Accordion {...{ header }} color={colors.grey["900"]} className={css.accordion}>
      <View className={css.accordionBody}>
        <View className={css.rows}>
          {regExMaps.map((map, i) => (
            <RegExMapRow key={i} map={map} />
          ))}
        </View>

        <View row justify="center" padding={{ top: "0.5rem" }}>
          <Button
            text="New Mapping"
            icon="Add"
            onClick={handleAdd}
            color={colors.button.darkGrey}
            fullWidth
          />
        </View>
      </View>
    </Accordion>
  );
});

const useClasses = makeClasses({
  accordion: {
    marginBottom: "1rem",
  },
  accordionBody: {
    display: "flex",
    flexDirection: "column",
    padding: "0.5rem",
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 4,
    backgroundColor: colors.grey["800"],
  },
  rows: {
    paddingTop: "0.5rem",
    maxHeight: "20rem",
    overflowY: "auto",
  },
});
