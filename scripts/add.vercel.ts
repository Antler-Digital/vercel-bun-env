import { $, argv } from "bun";
import { unlinkSync } from "node:fs";
import { parseArgs } from "util";

const TEMP_FILE = "in-memory.env";

const { values } = parseArgs({
  args: argv,
  options: {
    var: {
      type: "string",
      multiple: true,
      short: "v",
    },
    env: {
      type: "string",
      default: "development",
      short: "e",
    },
    update: {
      type: "boolean",
      default: false,
      short: "u",
    },
  },
  strict: true,
  allowPositionals: true,
});

const ENV = values.env;

if (values.var) {
  for (let i = 0; i < values.var.length; i++) {
    const [key, value] = values.var[i].split("=");

    const file = Bun.file(TEMP_FILE);
    file.writer().write(value);

    try {
      if (values.update === true) {
        await $`vercel env rm ${key} ${ENV} --yes`;
        console.log(`Removed ${key} from ${ENV} environment variables`);
      }

      await $`vercel env add ${key} ${ENV} < ${TEMP_FILE}`;

      await $`vercel env ls ${ENV}`;

      console.log(
        `${values.var.length} environment variables pushed successfully`
      );
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
