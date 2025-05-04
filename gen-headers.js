import { mkdirSync, writeFileSync } from "fs";
import "dotenv/config";

const auth = process.env.BASIC_AUTH;

const contents = ["/admin/*", `  Basic-Auth: ${auth}`].join("\n") + "\n";
mkdirSync("public", { recursive: true });
writeFileSync("public/_headers", contents);