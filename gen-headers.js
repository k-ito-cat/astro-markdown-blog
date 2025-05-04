import { writeFileSync } from "fs";
import "dotenv/config";
  
const auth = process.env.BASIC_AUTH;
writeFileSync(
  "_headers",
  ["/admin/*", `  Basic-Auth: ${auth}`].join("\n"),
);
  