import { copyFileSync, writeFileSync } from "node:fs";
import { functionCopies } from "./function-copies";
import { notificationFiles } from "./notification-files";

for (const file of await notificationFiles()) writeFileSync(file.path, file.content);
for (const copy of functionCopies) copyFileSync(copy.from, copy.to);
