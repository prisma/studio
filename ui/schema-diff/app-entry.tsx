import { createRoot } from "react-dom/client";

import { SchemaDiffApp } from "./SchemaDiffApp";

const root = document.getElementById("root");
if (root) createRoot(root).render(<SchemaDiffApp />);
