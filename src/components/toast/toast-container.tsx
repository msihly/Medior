import { colors } from "@mui/material";
import { Icon, IconName } from "components";
import {
  ToastContainer as ToastContainerBase,
  ToastContainerProps,
  TypeOptions,
} from "react-toastify";
import { makeClasses } from "utils";

export const ToastContainer = (props: ToastContainerProps) => {
  const { css } = useClasses(null);
  return (
    <ToastContainerBase
      position="bottom-left"
      icon={({ type }) => <Icon name={ICON_TYPES[type].icon} color={ICON_TYPES[type].color} />}
      className={css.toast}
      {...props}
    />
  );
};

const ICON_TYPES: { [key in TypeOptions]: { color: string; icon: IconName } } = {
  default: {
    color: colors.blue["800"],
    icon: "CircleNotifications",
  },
  error: {
    color: colors.red["800"],
    icon: "Error",
  },
  info: {
    color: colors.blue["800"],
    icon: "Info",
  },
  success: {
    color: colors.green["800"],
    icon: "CheckCircle",
  },
  warning: {
    color: colors.orange["800"],
    icon: "NewReleases",
  },
};

const useClasses = makeClasses({
  toast: {
    "& .Toastify__toast": {
      backgroundColor: colors.grey["900"],
      color: colors.grey["200"],
      "&-body": {
        display: "flex",
        alignItems: "center",
        fontFamily: "Roboto",
        fontSize: "1.1em",
        fontWeight: 400,
        whiteSpace: "break-spaces",
      },
      "&-icon": {
        marginRight: "1em",
      },
      "&--default": {
        borderColor: ICON_TYPES.default.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.default.color },
      },
      "&--error": {
        borderColor: ICON_TYPES.error.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.error.color },
      },
      "&--info": {
        borderColor: ICON_TYPES.info.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.info.color },
      },
      "&--success": {
        borderColor: ICON_TYPES.success.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.success.color },
      },
      "&--warning": {
        borderColor: ICON_TYPES.warning.color,
        "& .Toastify__progress-bar": { background: ICON_TYPES.warning.color },
      },
      "& .Toastify__close-button": {
        margin: 0,
        lineHeight: 1,
        color: colors.grey["400"],
        "&:hover": {
          backgroundColor: "transparent",
          color: colors.red["700"],
        },
      },
    },
  },
});
