import { Comp, IconButton } from "medior/components";
import { useStores } from "medior/store";
import { ConfigKey } from "medior/utils/server";
import { Field } from "./field";
import { Input } from "./input";

export interface PlayerFieldsProps {
  configKey: "file.videoPlayer" | "music.player";
  /** What the player opens, shown under its program. */
  description: string;
  selectProgram: (defaultPath?: string) => Promise<string | undefined>;
}

/** A player's program, chosen from a file dialog, and its arguments. */
export const PlayerFields = Comp(({ configKey, description, selectProgram }: PlayerFieldsProps) => {
  const stores = useStores();
  const store = stores.home.settings;

  const programKey: ConfigKey = `${configKey}.path`;
  const program = store.getConfigByKey<string>(programKey);

  const handleClear = () => store.update({ [programKey]: "" });

  const handleProgramClick = async (event: React.MouseEvent) => {
    event.preventDefault();

    const programPath = await selectProgram(program || undefined);

    if (programPath) store.update({ [programKey]: programPath });
  };

  return (
    <>
      <Field label="Program" description={description} wide>
        <Input configKey={programKey} onClick={handleProgramClick} flex={1} />

        <IconButton
          name="Close"
          onClick={handleClear}
          disabled={!program}
          tooltip="Use Windows' default program"
        />
      </Field>

      <Field
        label="Arguments"
        description="{path} is the file or playlist it opens. Without {path}, it goes last."
      >
        <Input configKey={`${configKey}.args`} width="16rem" />
      </Field>
    </>
  );
});
