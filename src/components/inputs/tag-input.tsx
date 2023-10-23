import {
  ComponentProps,
  Dispatch,
  forwardRef,
  HTMLAttributes,
  MutableRefObject,
  SetStateAction,
  useEffect,
  useState,
} from "react";
import { observer } from "mobx-react-lite";
import { TagOption, useStores } from "store";
import {
  Autocomplete,
  AutocompleteChangeReason,
  AutocompleteRenderGetTagProps,
  AutocompleteRenderInputParams,
  Chip,
  colors,
} from "@mui/material";
import { Button, Input, InputProps, Tag, View } from "components";
import { makeClasses, socket } from "utils";
import { CSSObject } from "tss-react";
import { toast } from "react-toastify";

export type TagInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "renderInput" | "onChange" | "onSelect" | "options"
> & {
  autoFocus?: boolean;
  center?: boolean;
  hasCreate?: boolean;
  hasHelper?: boolean;
  inputProps?: InputProps;
  label?: string;
  onTagClick?: (tagId: string) => void;
  opaque?: boolean;
  options?: TagOption[];
  onChange?: (val: TagOption[]) => void;
  onSelect?: (val: TagOption) => void;
  setValue?: Dispatch<SetStateAction<TagOption[]>>;
  value: TagOption[];
  width?: CSSObject["width"];
};

export const TagInput = observer(
  forwardRef(
    (
      {
        autoFocus = false,
        center,
        className,
        disabled,
        hasCreate = true,
        hasHelper = false,
        inputProps,
        label,
        onChange,
        onSelect,
        onTagClick,
        opaque = false,
        options = [],
        setValue,
        value = [],
        width,
        ...props
      }: TagInputProps,
      inputRef?: MutableRefObject<HTMLDivElement>
    ) => {
      const { tagStore } = useStores();
      const { css, cx } = useClasses({ center, opaque, width });

      const [inputValue, setInputValue] = useState<string>(inputProps?.value ?? "");
      const [isOpen, setIsOpen] = useState(false);

      useEffect(() => {
        socket?.on?.("tagDeleted", ({ tagId }) => {
          setValue?.((prev) => prev.filter((t) => t.id !== tagId));
        });
      }, [socket, onChange]);

      useEffect(() => {
        setInputValue(inputProps?.value);
      }, [inputProps?.value]);

      const filterOptions = (options: TagOption[], { inputValue }) => {
        const searchTerms = inputValue.trim().toLowerCase().split(" ");
        const filtered = options
          .filter((o) =>
            [o.label.toLowerCase(), ...(o.aliases?.map((a) => a.toLowerCase()) ?? [])].some(
              (label) => searchTerms.every((t) => label.includes(t))
            )
          )
          .slice(0, 100);

        return hasCreate &&
          inputValue.length > 0 &&
          !filtered.find((o) => o.label.toLowerCase() === inputValue.toLowerCase())
          ? [...filtered, { id: "optionsEndNode", count: 0 }]
          : filtered;
      };

      const handleChange = (_, val: TagOption[], reason?: AutocompleteChangeReason) => {
        onChange?.(val);
        if (reason === "selectOption") setInputValue("");
      };

      const handleClose = () => setIsOpen(false);

      const handleCreateTag = async () => {
        const res = await tagStore.createTag({ label: inputValue });
        if (!res.success) return toast.error(res.error);
        onChange?.([...value, res.data]);
        setInputValue("");
        handleClose();
      };

      const handleInputChange = (val: string) => {
        setInputValue(val);
        inputProps?.setValue?.(val);
      };

      const handleOpen = () => setIsOpen(true);

      const renderInput = (params: AutocompleteRenderInputParams) => (
        <Input
          {...params}
          {...{ autoFocus, disabled, hasHelper, label, width }}
          {...inputProps}
          ref={inputRef}
          value={inputValue}
          setValue={handleInputChange}
          className={cx(css.input, className)}
        />
      );

      const renderOption = (
        props: HTMLAttributes<HTMLLIElement> & HTMLAttributes<HTMLDivElement>,
        option: TagOption
      ) => (
        <View
          {...props}
          onClick={(event) => {
            if (option.id === "optionsEndNode") return;
            onSelect ? onSelect(option) : props.onClick?.(event);
            setInputValue("");
            handleClose();
          }}
          className={cx(props.className, css.tagOption)}
        >
          {option.id === "optionsEndNode" ? (
            <Button text={`Create Tag '${inputValue}'`} icon="Add" onClick={handleCreateTag} />
          ) : (
            <>
              <Tag key={option.id} id={option.id} className={css.tag} />

              {option.aliases?.length > 0 && (
                <View className={css.aliases}>
                  {option.aliases.map((a) => (
                    <Chip key={a} label={a} size="small" className={css.alias} />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      );

      const renderTags = (val: TagOption[], getTagProps: AutocompleteRenderGetTagProps) =>
        val.map((option: TagOption, index: number) => (
          <Tag
            {...getTagProps({ index })}
            key={option.id}
            id={option.id}
            onClick={onTagClick ? () => onTagClick(option.id) : null}
          />
        ));

      return (
        <Autocomplete
          {...{ filterOptions, options, renderInput, renderOption, renderTags, value }}
          getOptionLabel={(option: TagOption) =>
            option?.label ?? tagStore.getById(option.id)?.label ?? ""
          }
          onChange={handleChange}
          isOptionEqualToValue={(option: TagOption, val: TagOption) => option.id === val.id}
          size="small"
          forcePopupIcon={false}
          clearOnBlur={false}
          disableClearable
          multiple
          open={isOpen}
          onOpen={handleOpen}
          onClose={handleClose}
          {...props}
        />
      );
    }
  )
);

const useClasses = makeClasses((_, { center, opaque, width }) => ({
  alias: {
    margin: "0.3rem 0 0 0.3rem",
    fontSize: "0.7em",
    opacity: 0.7,
  },
  aliases: {
    display: "flex",
    flexFlow: "row wrap",
    alignSelf: "flex-start",
  },
  input: {
    backgroundColor: opaque ? colors.grey["800"] : "transparent",
    "& .MuiAutocomplete-inputRoot": {
      justifyContent: center ? "center" : undefined,
    },
    "& .MuiAutocomplete-input": {
      // flex: 0,
      // padding: "0 !important",
      minWidth: "0 !important",
    },
  },
  tag: {
    alignSelf: "flex-start",
    marginLeft: 0,
  },
  tagOption: {
    display: "flex",
    flexDirection: "column",
    marginBottom: "0.3rem",
    width,
    "&.MuiAutocomplete-option": {
      padding: "0.2rem 0.5rem",
    },
  },
}));
