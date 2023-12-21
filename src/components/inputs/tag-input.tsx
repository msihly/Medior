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
import { SearchTagType, TagOption, useStores } from "store";
import {
  Autocomplete,
  AutocompleteChangeReason,
  AutocompleteRenderGetTagProps,
  AutocompleteRenderInputParams,
} from "@mui/material";
import { Button, Chip, IconName, Input, InputProps, ListItem, Tag, View } from "components";
import { colors, makeClasses, Margins, socket } from "utils";
import { CSSObject } from "tss-react";
import { toast } from "react-toastify";

const SEARCH_MENU_META: {
  [key in SearchTagType]: { color: string; icon: IconName; text: string };
} = {
  exclude: {
    color: colors.red["700"],
    icon: "RemoveCircleOutline",
    text: "Exclude",
  },
  excludeDesc: {
    color: colors.red["700"],
    icon: "RemoveCircle",
    text: "Exclude (Descendants)",
  },
  includeAnd: {
    color: colors.green["700"],
    icon: "AddCircle",
    text: "Include (Required)",
  },
  includeOr: {
    color: colors.green["700"],
    icon: "AddCircleOutline",
    text: "Include (Optional)",
  },
  includeDesc: {
    color: colors.green["700"],
    icon: "ControlPointDuplicate",
    text: "Include (Descendants)",
  },
};

export type TagInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "renderInput" | "onChange" | "onSelect" | "options"
> & {
  /** Only for specific use cases. Use onChange instead. */
  _setValue?: Dispatch<SetStateAction<TagOption[]>>;
  autoFocus?: boolean;
  center?: boolean;
  hasCreate?: boolean;
  hasHelper?: boolean;
  hasSearchMenu?: boolean;
  inputProps?: InputProps;
  label?: string;
  margins?: Margins;
  onTagClick?: (tagId: string) => void;
  opaque?: boolean;
  options?: TagOption[];
  onChange?: (val: TagOption[]) => void;
  onSelect?: (val: TagOption) => void;
  value: TagOption[];
  width?: CSSObject["width"];
};

export const TagInput = observer(
  forwardRef(
    (
      {
        _setValue,
        autoFocus = false,
        center,
        className,
        disabled,
        hasCreate = false,
        hasHelper = false,
        hasSearchMenu,
        inputProps,
        label,
        margins,
        onChange,
        onSelect,
        onTagClick,
        opaque = false,
        options,
        value = [],
        width,
        ...props
      }: TagInputProps,
      inputRef?: MutableRefObject<HTMLDivElement>
    ) => {
      const { tagStore } = useStores();
      const { css, cx } = useClasses({ center, margins, opaque, width });

      options = options ?? [...tagStore.tagOptions];

      const [inputValue, setInputValue] = useState((inputProps?.value ?? "") as string);
      const [isOpen, setIsOpen] = useState(false);

      useEffect(() => {
        socket?.on?.("tagDeleted", ({ tagId }) => {
          _setValue?.((prev) => prev.filter((t) => t.id !== tagId));
        });
      }, [socket, onChange]);

      useEffect(() => {
        setInputValue(inputProps?.value as string);
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
        val.map((option: TagOption, index: number) =>
          !option ? null : (
            <Tag
              {...getTagProps({ index })}
              key={option.id}
              id={option.id}
              onClick={onTagClick ? () => onTagClick(option.id) : null}
              menuButtonProps={
                !hasSearchMenu
                  ? undefined
                  : {
                      icon: SEARCH_MENU_META[option.searchType]?.icon,
                      iconProps: { color: SEARCH_MENU_META[option.searchType]?.color },
                      padding: { all: 0 },
                      color: "transparent",
                    }
              }
              menu={
                hasSearchMenu ? (
                  <View>
                    <ListItem
                      text="Remove"
                      icon="Delete"
                      color={colors.red["700"]}
                      iconProps={{ color: colors.red["700"] }}
                      onClick={() => {
                        onChange?.(value.filter((t) => t.id !== option.id));
                      }}
                    />

                    {Object.entries(SEARCH_MENU_META).map(([type, { color, icon, text }]) => (
                      <ListItem
                        key={text}
                        {...{ icon, text }}
                        iconProps={{ color }}
                        onClick={() => {
                          onChange?.(
                            value.map((t) =>
                              t.id === option.id ? { ...t, searchType: type as SearchTagType } : t
                            )
                          );
                        }}
                      />
                    ))}
                  </View>
                ) : null
              }
            />
          )
        );

      return (
        <Autocomplete
          {...{ filterOptions, options, renderInput, renderOption, renderTags, value }}
          ListboxProps={{ className: css.listbox }}
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
          classes={{ root: css.root }}
          {...props}
        />
      );
    }
  )
);

const useClasses = makeClasses((_, { center, margins, opaque, width }) => ({
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
  listbox: {
    overflowX: "hidden",
    overflowY: "auto",
  },
  input: {
    backgroundColor: opaque ? colors.grey["800"] : "transparent",
    margin: margins?.all,
    marginTop: margins?.top,
    marginBottom: margins?.bottom,
    marginRight: margins?.right,
    marginLeft: margins?.left,
    "& .MuiAutocomplete-inputRoot": {
      justifyContent: center ? "center" : undefined,
    },
    "& .MuiAutocomplete-input": {
      minWidth: "0 !important",
    },
  },
  root: {
    display: "flex",
    alignItems: "center",
    width,
    "& > div": {
      width: "100%",
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
    "&.MuiAutocomplete-option": {
      padding: "0.2rem 0.5rem",
    },
  },
}));
