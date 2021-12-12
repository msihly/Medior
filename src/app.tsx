import React, { createContext, createRef, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { actions } from "store";
import { getImages } from "database";
import { ThemeProvider, createTheme } from "@mui/material";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { makeStyles } from "utils";
import { TopBar } from "components/topBar";
import { Drawer } from "components/drawer";
import { ImageContainer } from "components/images";
import { toast } from "react-toastify";
import "./css/index.scss";

toast.configure({
  position: "bottom-left",
  autoClose: 5000,
  hideProgressBar: false,
  newestOnTop: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  toastClassName: "Toastify__toast--dark",
});

export const muiCache = createCache({
  key: "mui",
  prepend: true,
});

export const AppContext = createContext<object | null>(null);

const DRAWER_WIDTH = 192;

const App = () => {
  const drawerRef = createRef();
  const dispatch = useDispatch();

  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("persistent");
  const [sortKey, setSortKey] = useState("dateCreated");
  const [sortDir, setSortDir] = useState("desc");
  const [includeValue, setIncludeValue] = useState([]);
  const [excludeValue, setExcludeValue] = useState([]);
  const [selectedImageTypes, setSelectedImageTypes] = useState({
    jpg: true,
    jpeg: true,
    png: true,
  });
  const [selectedVideoTypes, setSelectedVideoTypes] = useState({
    gif: true,
    webm: true,
    mp4: true,
    mkv: true,
  });

  const { classes: css } = useClasses({ drawerMode, drawerWidth: DRAWER_WIDTH, isDrawerOpen });

  useEffect(() => {
    const loadDatabase = async () => {
      const storedImages = await getImages();
      dispatch(actions.imagesAdded(storedImages));
    };

    loadDatabase();
  }, []); //eslint-disable-line

  return (
    <CacheProvider value={muiCache}>
      <ThemeProvider theme={darkTheme}>
        <AppContext.Provider
          value={{
            drawerMode,
            setDrawerMode,
            includeValue,
            setIncludeValue,
            excludeValue,
            setExcludeValue,
            isArchiveOpen,
            setIsArchiveOpen,
            isDrawerOpen,
            setIsDrawerOpen,
            selectedImageTypes,
            setSelectedImageTypes,
            selectedVideoTypes,
            setSelectedVideoTypes,
            sortKey,
            setSortKey,
            sortDir,
            setSortDir,
          }}
        >
          <Drawer ref={drawerRef} />

          <div className={css.main}>
            <TopBar />
            <ImageContainer mode="grid" />
          </div>
        </AppContext.Provider>
      </ThemeProvider>
    </CacheProvider>
  );
};

export default App;

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

const useClasses = makeStyles<object>()((_, { drawerMode, drawerWidth, isDrawerOpen }: any) => ({
  main: {
    display: "flex",
    flexFlow: "column",
    marginLeft: drawerMode === "persistent" && isDrawerOpen ? drawerWidth : 0,
    width:
      drawerMode === "persistent" && isDrawerOpen ? `calc(100% - ${drawerWidth}px)` : "inherit",
    height: "inherit",
    transition: "all 225ms ease-in-out",
  },
}));
