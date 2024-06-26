import { $, argv } from "bun";
import { parseArgs } from "util";
import { unlinkSync } from "node:fs";

const { values } = parseArgs({
  args: argv,
  options: {
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
const TEMP_FILE = ".env.removing";

// protected variables list; could also include VERCEL_* variables too if you want
const protectedVariables = [
  "NX_DAEMON",
  "TURBO_REMOTE_ONLY",
  "TURBO_RUN_SUMMARY",
];

try {
  // save env files to delete in a new file so as to avoid deleting all env vars
  await $`vercel env pull --environment=${ENV} ${TEMP_FILE}`;

  // use Bun to read file
  const file = Bun.file(TEMP_FILE);

  // read file content
  const content = await file.text();

  const lines = content.split("\n").filter((line) => line.includes("="));

  if (lines?.length) {
    for (let i = 0; i < lines.length; i++) {
      const [key, value] = lines[i].split("=");

      // don't remove protected variables
      if (
        key.startsWith("VERCEL") ||
        key.startsWith("TURBO") ||
        protectedVariables.includes(key)
      ) {
        console.log(`Skipping ${key}=${value}`);
        continue;
      }

      try {
        await $`vercel env rm ${key} ${ENV} --yes`;

        console.log(
          `Removed ${key}=${value} from ${ENV} environment variables`
        );
      } catch (error) {
        console.error(`Error removing ${key}=${value} from Vercel: ${error}`);
      } finally {
        // delete file
        unlinkSync(TEMP_FILE);
      }
    }
  } else {
    console.log("No environment variables to push");
  }
} catch (error) {}
