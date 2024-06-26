import { $, argv } from "bun";
import { parseArgs } from "util";

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
  },
  strict: true,
  allowPositionals: true,
});

if (values.var?.length) {
  for (let i = 0; i < values.var.length; i++) {
    const name = values.var[i];

    try {
      await $`vercel env rm ${name} ${values.env} --yes`;
    } catch (error) {
      console.error(`Error removing ${name} from Vercel: ${error}`);
    }
  }
}
