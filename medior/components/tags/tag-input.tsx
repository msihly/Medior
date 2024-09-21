import {
  ComponentProps,
  forwardRef,
  HTMLAttributes,
  MouseEvent,
  MutableRefObject,
  useCallback,
  useEffect,
  useState,
} from "react";
import { TagOption, observer, useStores } from "medior/store";
import {
  Autocomplete,
  AutocompleteChangeReason,
  AutocompleteRenderInputParams,
} from "@mui/material";
import {
  Button,
  HeaderWrapper,
  HeaderWrapperProps,
  Input,
  InputProps,
  TagInputRow,
  TagList,
  View,
} from "medior/components";
import { colors, CSS, makeClasses, makeMargins, Margins, socket, useDeepMemo } from "medior/utils";
import { toast } from "react-toastify";

export type TagInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "fullWidth" | "label" | "renderInput" | "onChange" | "onSelect" | "options"
> & {
  autoFocus?: boolean;
  center?: boolean;
  excludedIds?: string[];
  hasCreate?: boolean;
  hasDelete?: boolean;
  hasEditor?: boolean;
  hasHelper?: boolean;
  hasList?: boolean;
  hasSearchMenu?: boolean;
  header?: HeaderWrapperProps["header"];
  headerProps?: HeaderWrapperProps["headerProps"];
  inputProps?: InputProps;
  margins?: Margins;
  maxTags?: number;
  onTagClick?: (tagId: string) => void;
  options?: TagOption[];
  onChange?: (val: TagOption[]) => void;
  onSelect?: (val: TagOption) => void;
  single?: boolean;
  value: TagOption[];
  width?: CSS["width"];
};

export const TagInput = observer(
  forwardRef(
    (
      {
        autoFocus = false,
        center,
        className,
        disabled,
        excludedIds = [],
        hasCreate = false,
        hasDelete = true,
        hasEditor = true,
        hasHelper = false,
        hasList = true,
        hasSearchMenu,
        header,
        headerProps = {},
        inputProps,
        margins,
        maxTags,
        onChange,
        onSelect,
        onTagClick,
        options,
        single,
        value = [],
        width,
        ...props
      }: TagInputProps,
      inputRef?: MutableRefObject<HTMLDivElement>
    ) => {
      const stores = useStores();
      const { css, cx } = useClasses({ center, margins, width });

      const isMaxTags = maxTags > -1 && value.length >= maxTags;
      disabled = disabled || isMaxTags;

      const [inputValue, setInputValue] = useState((inputProps?.value ?? "") as string);
      const [isOpen, setIsOpen] = useState(false);

      const opts = useDeepMemo(options ?? [...stores.tag.tagOptions]);

      const removeDeletedTag = useCallback(
        ({ id }: { id: string }) => {
          const newValue = value.filter((t) => t.id !== id);
          if (newValue.length !== value.length) onChange?.(newValue);
        },
        [onChange, value]
      );

      const replaceMergedTag = useCallback(
        ({ oldTagId, newTagId }: { oldTagId: string; newTagId: string }) => {
          const oldTag = value.find((t) => t.id === oldTagId);
          if (!oldTag) return;

          const newTagOption = stores.tag.getById(newTagId)?.tagOption;
          const newValue = value.map((t) => (t.id === oldTagId ? newTagOption : t));
          onChange?.(newValue);
        },
        [onChange, value]
      );

      useEffect(() => {
        if (!socket?.connected) return;
        socket.on("onTagDeleted", removeDeletedTag);
        socket.on("onTagMerged", replaceMergedTag);

        return () => {
          socket.off("onTagDeleted", removeDeletedTag);
          socket.off("onTagMerged", replaceMergedTag);
        };
      }, [replaceMergedTag, socket?.connected]);

      useEffect(() => {
        setInputValue(inputProps?.value as string);
      }, [inputProps?.value]);

      const filterOptions = (options: TagOption[], { inputValue }: { inputValue: string }) => {
        const searchTerms = inputValue.trim().toLowerCase().split(" ");
        const filtered = options
          .filter(
            (o) =>
              o.label?.length > 0 &&
              excludedIds.every((id) => id !== o.id) &&
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

      const getOptionLabel = (option: TagOption) =>
        option?.label ?? stores.tag.getById(option.id)?.label ?? "";

      const handleChange = (_, val: TagOption[], reason?: AutocompleteChangeReason) => {
        if (disabled) return;
        if (reason === "selectOption") {
          if (val.some((t) => t.id === "optionsEndNode")) return handleCreateTag();
          setInputValue("");
        }
        onChange?.(val);
      };

      const handleClose = () => setIsOpen(false);

      const handleCreateTag = async () => {
        const res = await stores.tag.createTag({ label: inputValue });
        if (!res.success) return toast.error(res.error);
        onChange?.([...value, res.data]);
        setInputValue("");
        handleClose();
      };

      const handleInputChange = (val: string) => {
        if (disabled) return;
        setInputValue(val);
        inputProps?.setValue?.(val);
        if (val.length === 0) setIsOpen(false);
        else if (!isOpen) setIsOpen(true);
      };

      const handleOpen = () => !disabled && !!inputValue && setIsOpen(true);

      const isOptionEqualToValue = (option: TagOption, val: TagOption) => option.id === val.id;

      const renderInput = (params: AutocompleteRenderInputParams) => (
        <Input
          {...params}
          {...{ autoFocus, hasHelper, header, headerProps, width }}
          {...inputProps}
          ref={inputRef}
          value={inputValue}
          setValue={handleInputChange}
          disabled={disabled}
          borderRadiuses={!single && hasList ? { bottom: 0 } : undefined}
          className={cx(css.input, className)}
        />
      );

      const renderList = () => (
        <TagList
          {...{ hasDelete, hasEditor, hasSearchMenu, value }}
          search={{ onChange, value }}
          hasInput
        />
      );

      const renderOption = (
        props: HTMLAttributes<HTMLLIElement> & HTMLAttributes<HTMLDivElement>,
        option: TagOption
      ) => {
        const handleClick = (event: MouseEvent<HTMLDivElement>) => {
          if (option.id === "optionsEndNode") return;
          onSelect ? onSelect(option) : props.onClick?.(event);
          setInputValue("");
          handleClose();
        };

        return (
          <View {...props} onClick={handleClick} className={cx(props.className, css.tagOption)}>
            {option.id === "optionsEndNode" ? (
              <Button
                text={inputValue}
                icon="Add"
                onClick={handleCreateTag}
                color={colors.custom.purple}
                width="100%"
              />
            ) : (
              <TagInputRow tag={option} search={null} />
            )}
          </View>
        );
      };

      const renderTags = () => null;

      return (
        <View column height="100%" className={css.root}>
          {single && value.length > 0 ? (
            <HeaderWrapper {...{ header, headerProps }}>{renderList()}</HeaderWrapper>
          ) : (
            <>
              <Autocomplete
                {...{
                  filterOptions,
                  getOptionLabel,
                  isOptionEqualToValue,
                  renderInput,
                  renderOption,
                  renderTags,
                  value,
                }}
                clearOnBlur={false}
                disableClearable
                disabled={disabled}
                forcePopupIcon={false}
                multiple
                ListboxProps={{ className: css.listbox }}
                onChange={handleChange}
                onClose={handleClose}
                onOpen={handleOpen}
                open={isOpen}
                options={opts}
                size="small"
                {...props}
              />

              {!single && hasList && renderList()}
            </>
          )}
        </View>
      );
    }
  )
);

interface ClassesProps {
  center: boolean;
  margins: Margins;
  width: CSS["width"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  listbox: {
    backgroundColor: colors.background,
    boxShadow: "0 0 0.5rem 0.1rem rgba(0, 0, 0, 0.3)",
    overflowX: "hidden",
    overflowY: "auto",
  },
  input: {
    ...makeMargins(props.margins),
    "& .MuiAutocomplete-inputRoot": {
      justifyContent: props.center ? "center" : undefined,
    },
    "& .MuiAutocomplete-input": {
      minWidth: "0 !important",
    },
  },
  root: {
    display: "flex",
    alignItems: "center",
    width: props.width,
    "& > div": { width: "100%" },
  },
  tagOption: {
    width: "100%",
    "&.MuiAutocomplete-option": {
      padding: 0,
    },
  },
}));
