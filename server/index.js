try {
    const { NODE_ENV, PORT, SESSION_SECRET } = process.env;
    const DAY_IN_MS = 86400000;
    const express = require("express");
    const path = require("path");
    const cookieParser = require("cookie-parser");
    const multer = require("multer");
    const session = require("express-session");
    const MemoryStore = require("memorystore")(session);
    const app = express();
    exports.app = app;

    const sessionSetup = {
        cookie: { maxAge: DAY_IN_MS },
        store: new MemoryStore({ checkPeriod: DAY_IN_MS }),
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: true
    };

    if (NODE_ENV === "production") {
        app.enable("trust proxy");
        sessionSetup.cookie.secure = true;
    }

    app.use(cookieParser(SESSION_SECRET));
    app.use(session(sessionSetup));
    app.use(multer({ limits: { fieldSize: 25 * 1024 * 1024 } }).any());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, "../client/build")));

    app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Methods", "GET, POST");
        res.header("Access-Control-Allow-Headers", "Origin, Authorization, X-Requested-With, Content-Type, Accept");
        next();
    });

    const normalizedPath = path.join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(file => require("./routes/" + file));

    app.get("*", (req, res) => {
        return res.sendFile(path.join(__dirname, "../client/build", "index.html"));
    });

    app.listen(PORT || 3001, () => console.log(`Listening on port ${PORT || 3001}...`));
} catch (e) { console.error(e); }