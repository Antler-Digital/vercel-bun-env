import { $, argv } from "bun";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: argv,
  options: {
    env: {
      type: "string",
      default: "development",
      short: "e",
    },
    file: {
      type: "string",
      short: "f",
    },
  },
  strict: true,
  allowPositionals: true,
});

const ENV = values.env;
const TEMP_FILE = values.file || `.env.${ENV}`;

await $`vercel env pull --environment=${ENV} ${TEMP_FILE}`;
