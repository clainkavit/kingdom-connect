import { writeFileSync } from "node:fs";
import { themeCss } from "../src/design";

const tailwind = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n";

writeFileSync(new URL("../../../apps/admin/src/app/theme.css", import.meta.url), themeCss());
writeFileSync(new URL("../../../apps/member/global.css", import.meta.url), tailwind + themeCss());
