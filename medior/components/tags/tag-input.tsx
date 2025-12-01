import { ComponentProps, HTMLAttributes, MouseEvent, useEffect, useState } from "react";
import {
  Autocomplete,
  AutocompleteChangeReason,
  AutocompleteRenderInputParams,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import {
  Button,
  Comp,
  HeaderWrapper,
  HeaderWrapperProps,
  Input,
  InputProps,
  TagInputRow,
  TagList,
  View,
} from "medior/components";
import { TagOption, tagToOption, useStores } from "medior/store";
import { colors, CSS, makeClasses, makeMargins, Margins, toast } from "medior/utils/client";
import { bisectArrayChanges, dayjs } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export type TagInputProps = Omit<
  ComponentProps<typeof Autocomplete>,
  "defaultValue" | "fullWidth" | "label" | "renderInput" | "onChange" | "onSelect" | "options"
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
  includedIds?: string[];
  inputProps?: InputProps;
  margins?: Margins;
  maxTags?: number;
  onChange?: (val: TagOption[]) => void;
  onSelect?: (val: TagOption) => void;
  onTagClick?: (tagOpt: TagOption) => void;
  single?: boolean;
  value: TagOption[];
  width?: CSS["width"];
};

export const TagInput = Comp(
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
      includedIds = [],
      inputProps,
      margins,
      maxTags,
      onChange,
      onSelect,
      onTagClick,
      single,
      value = [],
      width,
      ...props
    }: TagInputProps,
    inputRef,
  ) => {
    const stores = useStores();
    const { css, cx } = useClasses({ center, margins, width });

    const isMaxTags = maxTags > -1 && value.length >= maxTags;
    disabled = disabled || isMaxTags;

    const [inputValue, setInputValue] = useState((inputProps?.value ?? "") as string);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<TagOption[]>([]);

    useEffect(() => {
      setInputValue(inputProps?.value as string);
    }, [inputProps?.value]);

    const filterOptions = (val: unknown[]) => val;
    const getOptionLabel = (option: TagOption) => option.label;
    const handleClose = () => setIsOpen(false);
    const handleOpen = () => !disabled && !!inputValue && setIsOpen(true);
    const isOptionEqualToValue = (option: TagOption, val: TagOption) => option.id === val.id;
    const renderTags = () => null;

    const handleChange = (_, val: TagOption[], reason?: AutocompleteChangeReason) => {
      if (disabled) return;
      if (reason === "selectOption") {
        if (val.some((t) => t.id === "optionsEndNode")) return handleCreateTag();
        setInputValue("");
        const { added } = bisectArrayChanges(value, val);
        if (added?.length)
          trpc.updateTag.mutate({
            args: { id: added[0].id, updates: { lastSearchedAt: dayjs().toISOString() } },
          });
      }
      onChange?.(val);
    };

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
      if (val.length > 0 && !isOpen) setIsOpen(true);
      searchTags(val);
    };

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
        InputProps={{
          ...params.InputProps,
          endAdornment: (
            <InputAdornment position="end">
              {isLoading ? <CircularProgress color="inherit" size={20} /> : null}
            </InputAdornment>
          ),
        }}
      />
    );

    const renderList = () => (
      <TagList
        {...{ hasDelete, hasEditor, hasSearchMenu, onTagClick, value }}
        search={{ onChange, value }}
        hasInput
      />
    );

    const renderOption = (
      props: HTMLAttributes<HTMLLIElement> & HTMLAttributes<HTMLDivElement>,
      option: TagOption,
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

    const searchTags = async (val: string) => {
      if (val.length === 0) {
        setOptions([]);
        handleClose();
        return;
      }

      try {
        setIsLoading(true);

        const searchStr = val.toLowerCase();
        const res = await trpc.searchTags.mutate({ excludedIds, includedIds, searchStr });
        if (!res.success) throw new Error(res.error);
        const opts = res.data.map(tagToOption);

        if (hasCreate && val.length > 0 && !opts.find((o) => o.label.toLowerCase() === searchStr))
          opts.push({ id: "optionsEndNode", count: 0, label: "" });

        setOptions(opts);
        handleOpen();
      } catch (err) {
        console.error(err), toast.error(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <View column height="100%" className={css.root}>
        {single && value.length > 0 ? (
          <HeaderWrapper {...{ header, headerProps }}>{renderList()}</HeaderWrapper>
        ) : (
          <>
            <Autocomplete
              {...props}
              {...{
                disabled,
                filterOptions,
                getOptionLabel,
                isOptionEqualToValue,
                options,
                renderInput,
                renderOption,
                renderTags,
                value,
              }}
              clearOnBlur={false}
              disableClearable
              forcePopupIcon={false}
              ListboxProps={{ className: css.listbox }}
              multiple
              onChange={handleChange}
              onClose={handleClose}
              onOpen={handleOpen}
              open={isOpen}
              size="small"
            />

            {!single && hasList && renderList()}
          </>
        )}
      </View>
    );
  },
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
