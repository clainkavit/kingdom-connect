import { writeFileSync } from "node:fs";
import { notificationFiles } from "./notification-files";

for (const file of await notificationFiles()) writeFileSync(file.path, file.content);
