import { $, argv } from "bun";
import { parseArgs } from "util";
import { unlinkSync } from "node:fs";

const { values } = parseArgs({
  args: argv,
  options: {
    file: {
      type: "string",
      default: ".env.example", // the file path where the environment variables are stored
      short: "f",
    },
    env: {
      type: "string",
      default: "development",
      short: "e",
    },
  },
  strict: true,
  allowPositionals: true,
});

const ENV = values.env;
const TEMP_FILE = "in-memory.env";

// get file path from args
const filePath = values.file;

if (!filePath) {
  // we set a default value for file path
  // but the linter still complains
  throw new Error("File path is required");
}

// use Bun to read file
const file = Bun.file(filePath);

// read file content
const content = await file.text();

// split content by new line -> ['key1=value1', 'key2=value2']
const lines = content.split("\n");

if (lines?.length) {
  for (let i = 0; i < lines.length; i++) {
    const [key, value] = lines[i].split("=");

    const file = Bun.file(TEMP_FILE);
    file.writer().write(value);

    try {
      await $`vercel env add ${key} ${ENV} < ${TEMP_FILE}`;

      await $`vercel env ls ${ENV}`;

      console.log(`${lines.length} environment variables pushed successfully`);
    } catch (error) {
      console.error(`Error pushing ${key}=${value} to Vercel: ${error}`);
    } finally {
      // delete file
      unlinkSync(TEMP_FILE);
    }
  }
} else {
  console.log("No environment variables to push");
}
