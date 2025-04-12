const PROJECT = "medior";

/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["./tsconfig.json"],
  },
  ignorePatterns: [
    "./.vscode",
    "./.wxt",
    "./Downloads",
    "./logs",
    "./MongoDB",
    "./node_modules",
    "./patches",
    "./public",
    `./${PROJECT}/face-models`,
    "vite.config.*",
  ],
  settings: {
    "import/resolver": {
      typescript: {
        project: "./tsconfig.json",
      },
    },
  },
  plugins: ["@typescript-eslint", "import", "prettier", "simple-import-sort", "tss-unused-classes"],
  rules: {
    "import/order": "off",
    "simple-import-sort/imports": [
      "warn",
      {
        groups: [
          [
            "^\\u0000",
            "^(@)?electron",
            "^(fs|node:|path)",
            "^react",
            "^@?\\w",
            `^${PROJECT}/.*/_generated`,
            `^${PROJECT}/(ext|generator|server)`,
            `^${PROJECT}/(components|css|store|utils|views)`,
            "^\\.",
            "\\.(s)?css(\\?inline)?$",
          ],
        ],
      },
    ],
    "simple-import-sort/exports": "warn",
    "tss-unused-classes/unused-classes": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "lodash.clonedeep",
            importNames: ["default"],
            message: `Import 'deepClone' from '${PROJECT}/utils/common' instead.`,
            allowTypeImports: true,
          },
          {
            name: "lodash.debounce",
            importNames: ["default"],
            message: `Import 'debounce' from '${PROJECT}/utils/common' instead.`,
            allowTypeImports: true,
          },
          {
            name: "lodash.isequal",
            importNames: ["default"],
            message: `Import 'isDeepEqual' from '${PROJECT}/utils/common' instead.`,
            allowTypeImports: true,
          },
          {
            name: "lodash.throttle",
            importNames: ["default"],
            message: `Import 'throttle' from '${PROJECT}/utils/common' instead.`,
            allowTypeImports: true,
          },
          {
            name: "react-toastify",
            importNames: ["toast", "ToastContainer"],
            message: `Import from '${PROJECT}/components' instead.`,
            allowTypeImports: true,
          },
          {
            name: "sharp",
            importNames: ["default"],
            message: `Import from '${PROJECT}/utils/common' instead.`,
            allowTypeImports: true,
          },
          {
            name: "@mui/material",
            importNames: ["TextField", "TextFieldProps"],
            message: `Import 'Input' from '${PROJECT}/components' instead.`,
            allowTypeImports: true,
          },
          {
            name: "@mui/material",
            importNames: ["Dialog", "DialogActions", "DialogContent", "DialogTitle"],
            message: `Import 'Modal' from '${PROJECT}/components' instead.`,
            allowTypeImports: true,
          },
          {
            name: "@mui/material",
            importNames: ["Pagination"],
            message: `Import 'Pagination' from '${PROJECT}/components' instead.`,
            allowTypeImports: true,
          },
          {
            name: "@mui/material",
            importNames: ["Typography", "TypographyProps"],
            message: `Import 'Text' from '${PROJECT}/components' instead.`,
            allowTypeImports: true,
          },
          {
            name: "@mui/material",
            importNames: [
              "Accordion",
              "AccordionProps",
              "Button",
              "ButtonProps",
              "Checkbox",
              "CheckboxProps",
              "Chip",
              "Icon",
              "IconProps",
              "IconButton",
              "IconButtonProps",
              "ListItem",
              "ListItemProps",
              "Modal",
              "Tooltip",
              "TooltipProps",
            ],
            message: `Import from '${PROJECT}/components' instead.`,
            allowTypeImports: true,
          },
          {
            name: "@mui/material",
            importNames: ["colors"],
            message: `Import from '${PROJECT}/utils/common' instead.`,
            allowTypeImports: true,
          },
          {
            name: "@mui/material",
            importNames: ["CSSObject"],
            message: `Import 'CSS' from '${PROJECT}/utils/common' instead.`,
            allowTypeImports: false,
          },
          {
            name: "tss-react",
            importNames: ["CSSObject"],
            message: `Import 'CSS' from '${PROJECT}/utils/common' instead.`,
            allowTypeImports: false,
          },
          {
            name: "dayjs",
            importNames: ["default"],
            message: `Import from '${PROJECT}/utils/common' instead.`,
            allowTypeImports: true,
          },
        ],
      },
    ],
  },
};
