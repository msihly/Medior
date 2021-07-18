const months = ["", "Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

export const arrayIntersect = (...arrays) => [...arrays].reduce((acc, cur) => acc.filter(e => cur.includes(e)));

export const capitalize = (string) => string[0].toUpperCase() + string.substring(1);

export const checkEmpty = (arr) => {
    if (arr === undefined) { return console.error("Undefined reference passed to 'checkEmpty(arr)' const"); }
    return arr.length < 1 ? true : false;
};

export const compareLogic = (type, ...items) => type === "and" ? items.every(Boolean) : (type === "or" ? items.some(Boolean) : "Missing type parameter");

export const countItems = (arr) => {
    const map = arr.reduce((acc, cur) => acc.set(cur, (acc.get(cur) || 0) + 1), new Map());
    return [...map.entries()];
};

export const debounce = (fn, delay) => {
    let timeout;
    return (...args) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            fn(...args);
            timeout = null;
        }, delay);
    };
};

export const formatBytes = (bytes) => {
    if (bytes < 1) { return "0 B"; }
    const power = Math.floor(Math.log2(bytes) / 10);
    return `${(bytes / (1024 ** power)).toFixed(2)} ${("KMGTPEZY"[power - 1] || "")}B`;
};

export const formatDate = (dateTime, type = "date") => {
    const [year, month, day, time] = [dateTime.substring(0, 4), dateTime.substring(5, 7), dateTime.substring(8, 10), dateTime.substring(11)];
    switch (type.toLowerCase()) {
        case "date": return `${months[+month]} ${day}, ${year}`;
        case "datetime": return `${months[+month]} ${day}, ${year} | ${new Date(`1970-01-01T${time}`).toLocaleTimeString({}, {hour: "numeric", minute: "numeric"})}`;
        case "time": return new Date(`1970-01-01T${time}`).toLocaleTimeString({}, {hour: "numeric", minute: "numeric"});
        default:
    }
};

export const getLocalDate = (dateTime) => {
    const date = new Date(`${dateTime} UTC`);
    const localDate = new Date(date.setMinutes(date.getMinutes() - date.getTimezoneOffset())).toISOString();
    return `${localDate.substring(0, 10)} ${localDate.substring(11, 19)}`;
};

export const getRandomInt = (min, max, cur = null) => {
    let num = Math.floor(Math.random() * (max - min + 1)) + min;
    return (num === cur) ? getRandomInt(min, max, cur) : num;
};

export const leadZeros = (num, places) => String(num).padStart(places, "0");

export const regexEscape = (string) => string.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

export const rotateArrayPos = (direction, current, length) => {
    if (direction === "next") { return current + 1 < length ? current + 1 : 0; }
    else if (direction === "prev") { return current - 1 >= 0 ? current - 1 : length - 1; }
};

export const uniqueArrayFilter = (...arrays) => {
    const all = [].concat(...arrays);
    const nonUnique = all.filter((set => value => set.has(value) || !set.add(value))(new Set()));
    return all.filter(e => !nonUnique.includes(e));
};

export const uniqueArrayMerge = (oldArray, newArrays) => [...new Set([...new Set(oldArray), ...[].concat(...newArrays)])];

export const validate = (type, value) => {
    switch (type) {
        case "url":
            return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(value);
        default:
    }
};