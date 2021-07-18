import ReactDOM from "react-dom";

const portalRoot = document.getElementById("portal-root");
const Portal = ({ children }) => ReactDOM.createPortal(children, portalRoot);

export default Portal;