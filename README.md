# vercel-env


## Introduction

Sharing environment variables between teams can be challenging, but there are several approaches to manage this securely and efficiently:

Vercel offers a robust solution for managing environment variables across projects and teams. Their platform allows you to create separate environments (development, preview, production) and interact with them using the Vercel CLI. The `vercel env` commands enable pushing, pulling, and removing variables, providing a streamlined workflow for teams.

However, the built-in `vercel env` commands have some limitations. To enhance this functionality, you can leverage Bun to create a custom solution that builds upon Vercel's capabilities. This approach allows for more flexibility and tailored management of environment variables.

For teams not using Vercel, there are alternative methods:

1. Shared password managers like NordPass can be used, though they require copy-pasting and authentication via master passwords, which isn't ideal for seamless workflows[5].

2. Workspace tools like Slack can be used to share variables, but this method is not secure and should be avoided for sensitive information[1].

3. Paid services like Envkey offer secure solutions but either require self-hosting for free use or come with a cost for premium features[3].

4. For self-hosted solutions, tools like Envault allow teams to manage and sync .env files across projects. This approach provides more control but requires setup and maintenance[3].

5. Some teams opt for generating variables locally and using .gitignore to prevent them from being committed. Secrets can then be stored in cloud services, Kubernetes secrets, or tools like Vault, with automated access patterns to generate and load .env files into containers when run locally[1].

6. For Netlify users, there are options to manage variables across sites and teams using both the UI and CLI. This includes importing/exporting variables in .env format and setting shared variables at the team level[5].

Ultimately, the best approach depends on your team's specific needs, infrastructure, and security requirements. Vercel's solution, enhanced with custom Bun scripts, offers a powerful and flexible option for teams already using or considering Vercel for their projects.

## Prerequisites

- [Bun](https://bun.sh/)
- [Vercel CLI](https://vercel.com/docs/cli)

## Setup

1. Create a new Vercel project either via the website or CLI (below). This will create an empty project that you can interact with. By default, Vercel sets each project up with three environments: development, preview and production, but you can fine tune these to match your needs.

```bash
vercel project add vercel-env
```

2. Locally, our project will end up using scripts in our `package.json` to interact with Vercel. We'll be using Bun to run these scripts, so make sure you have it installed.

3. As we'll be creating and interacting with different `.env` files, we'll want to add them to our `.gitignore` file to prevent them from being committed to our repository. This is generally recommended. However, we'll be creating and using a `.env.example` file later on so we can exclude that from the `.gitignore` file.

```bash
# .gitignore

.env.*
!.env.example
```

---

### Read and save environment variables from Vercel

We'll start with the simplest command: reading and saving environment variables from Vercel. This will allow us to save the environment variables from a specific environment to a local file. This is useful for sharing environment variables with other team members or for backing up your environment variables.

Create a directory called `scripts` in the root of your project and create a new file called `pull.vercel.ts` inside it. This file will contain the script to pull the environment variables from Vercel.

```typescript
// scripts/pull.vercel.ts

import { $ } from "bun"; // The $ function allows us to run shell commands
import { parseArgs } from "util"; // The parseArgs function allows us to pass in arguments from the CLI

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    env: { // name of the environment we want to pull the variables from
      type: "string", // the type of the argument - string or boolean only
      default: "development", // the default value if the argument is not provided - optional
      short: "e", // the short version of the argument - optional
    },
    file: {
      type: "string",
      short: "f",
    },
  },
  strict: true,
  allowPositionals: true,
});

// The environment - development, preview, production
const ENV = values.env;
const TEMP_FILE = values.file || `.env.${ENV}`; // The name of the file we want to save the environment variables to - can be custom but defaults to .env.development, .env.preview, .env.production

await $`vercel env pull --environment=${ENV} ${TEMP_FILE}`;

```

Then we can add a new script to our `package.json` file to run this script.

```json
// package.json

{
  "scripts": {
	"pull": "bun run scripts/pull.vercel.ts"
  }
}
```

From the CLI we can now run the following command to pull the environment variables from Vercel and save them to a local file.


```bash
# or
bun run pull # default to bun run pull -e development

```

It's important here to note that Vercel's `preview` and `production` environments come prepopulated with environment variables that are set by Vercel. These will get pulled down by the command above.

```bash
bun run pull --env preview
bun run pull --env production
```

These commands will create a `.env.preview` and `.env.production` file respectively with the following default values

```txt
# Created by Vercel CLI
NX_DAEMON="false"
TURBO_DOWNLOAD_LOCAL_ENABLED="true"
TURBO_REMOTE_ONLY="true"
TURBO_RUN_SUMMARY="true"
VERCEL="1"
VERCEL_ENV="production"
VERCEL_GIT_COMMIT_AUTHOR_LOGIN=""
VERCEL_GIT_COMMIT_AUTHOR_NAME=""
VERCEL_GIT_COMMIT_MESSAGE=""
VERCEL_GIT_COMMIT_REF=""
VERCEL_GIT_COMMIT_SHA=""
VERCEL_GIT_PREVIOUS_SHA=""
VERCEL_GIT_PROVIDER=""
VERCEL_GIT_PULL_REQUEST_ID=""
VERCEL_GIT_REPO_ID=""
VERCEL_GIT_REPO_OWNER=""
VERCEL_GIT_REPO_SLUG=""
VERCEL_URL=""

```

At this point you might be wondering "why not just use the `vercel env pull` command directly?". The reason is so we can build on this to run more complex commands that Vercel doesn't directly support.

### Add and update environment variables via the Vercel CLI

As of writing, Vercel only supports adding a single environment variable at a time via the CLI. This can be a bit cumbersome if you have a lot of environment variables to add. We can use Bun to create a script that allows us to add multiple environment variables at once. We get around the one-by-one limitation by a combination of looping and using Vercel's file piping feature.

Create a new file called `add.vercel.ts` in the `scripts` directory.

```typescript
// scripts/add.vercel.ts
import { $, argv } from "bun";
import { unlinkSync } from "node:fs";
import { parseArgs } from "util";

// temporary file we create then delete to store the environment variable
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
    update: { // option to override existing environment variables, otherwise Vercel will throw if it already exists
      type: "boolean",
      default: false,
      short: "u",
    },
  },
  strict: true,
  allowPositionals: true,
});

const ENV = values.env;

// loop over the key-value variables
if (values.var) {
  for (let i = 0; i < values.var.length; i++) {
    const [key, value] = values.var[i].split("="); // split the pairs

	// create a temporary file to store the environment variable
    const file = Bun.file(TEMP_FILE);
    file.writer().write(value);

    try {
	  // if the update flag is set to true, remove the existing environment variable
      if (values.update === true) {
        await $`vercel env rm ${key} ${ENV} --yes`; // the --yes flag is to confirm the deletion without a user prompt
        console.log(`Removed ${key} from ${ENV} environment variables`); // feedback
      }

	  // the `< ${TEMP_FILE}` is to pipe the file contents to the command
      await $`vercel env add ${key} ${ENV} < ${TEMP_FILE}`;

      // list the environment variables to confirm the addition
      await $`vercel env ls ${ENV}`; 

      console.log(`Environment variable added`);
    } catch (error) {
      console.error(`Error pushing ${key}=${value} to Vercel: ${error}`);
    } finally {
      // delete the temporary file using node:fs unlinkSync
      unlinkSync(TEMP_FILE);
    }
  }
} else {
  console.log("No environment variables to push");
}

```

Add a new script to the `package.json` file to run this script.

```json
// package.json

{
  "scripts": {
	"pull": "bun run scripts/pull.vercel.ts",
	"add:cli": "bun run scripts/add.vercel.ts"
  }
}
```

```bash
bun run add:cli -v TEST_1=hello -v TEST_2=goodbye -e development

# run a second time with the update flag to overwrite the existing environment variables
bun run add:cli -v TEST_1=aloha -v TEST_2=adios -e development -u 

# 2 environment variables pushed successfully

```

### Add environment variables to Vercel from a local file

By now you might have guessed the limitations of Vercel's CLI: interacting with many environment variables at once. Mny teams like ours deal with dozens of environment variables across multiple environments. Adding one by one is not only time-consuming but also error-prone. We can use Bun to create a script that allows us to add multiple environment variables from a local file.

We can leverage the code above to create a new script called `add-from-file.vercel.ts` in the `scripts` directory. Here, we use Bun to read a file, split the lines and loop over them, then use the same code as above to add the environment variables to Vercel.

First create a file called `.env.example` in the root of your project. This file will contain the environment variables you want to add to Vercel. For example:

```txt
# .env.example
FROM_FILE_1=hello
FROM_FILE_2=goodbye
```

```typescript
// scripts/add-from-file.vercel.tsimport { $, argv } from "bun";
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
	// the the ability to update
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
const lines = content.split("\n").filter((line) => line.includes("="));

if (lines?.length) {
  for (let i = 0; i < lines.length; i++) {
    const [key, value] = lines[i].split("=");

    const file = Bun.file(TEMP_FILE);
    file.writer().write(value);

    try {
      if (values.update === true) {
        await $`vercel env rm ${key} ${ENV} --yes`;
        console.log(`Removed ${key} from ${ENV} environment variables`);
      }

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


```

Add a new script to the `package.json` file to run this script.

```json
// package.json

{
  "scripts": {
	"pull": "bun run scripts/pull.vercel.ts",
	"add:cli": "bun run scripts/add.vercel.ts",
	"add:file": "bun run scripts/add-from-file.vercel.ts"
  }
}
```

```bash
bun run add:file -f .env.example -e development
```

Depending on how many environment variables you have it might take a while to add them all since Vercel insists on doing them one by one. But at least you can now add them all at once.

### Remove environment variables from Vercel (CLI)

Next up, we want the ability to remove variables. As you probably saw above it our makeshift 'update' version, we can use the `vercel env rm` command to remove a single environment variable. We can use Bun to create a script that allows us to remove multiple environment variables at once.

Create a new file called `remove.vercel.ts` in the `scripts` directory.

```typescript
// scripts/remove.vercel.ts
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

```

Add a new script to the `package.json` file to run this script.

```json
// package.json

{
  "scripts": {
	"pull": "bun run scripts/pull.vercel.ts",
	"add:cli": "bun run scripts/add.vercel.ts",
	"add:file": "bun run scripts/add-from-file.vercel.ts",
	"remove": "bun run scripts/remove.vercel.ts"
  }
}
```

Then we can run the following command to remove the environment variables from Vercel.

```bash
bun run remove -v TEST_1 -v TEST_2 -e development

Removing
Removed Environment Variable [267ms]
```

### Remove all environment variables from Vercel

Finally, we can create a script that removes all environment variables from a specific environment. This is useful if you want to start fresh or if you want to remove all environment variables before adding new ones. To do this, we use `vercel env pull` to get a list of all the environment variables, then we loop over them and remove them one by one.

However, we have to be careful not to remove the specific environment variables that Vercel sets by default.

Create a new file called `remove-all.vercel.ts` in the `scripts` directory.

```typescript
// scripts/remove-all.vercel.ts
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


```

Add a new script to the `package.json` file to run this script.

```json
// package.json

{
  "scripts": {
	"pull": "bun run scripts/pull.vercel.ts",
	"add:cli": "bun run scripts/add.vercel.ts",
	"add:file": "bun run scripts/add-from-file.vercel.ts",
	"remove": "bun run scripts/remove.vercel.ts",
	"remove:all": "bun run scripts/remove-all.vercel.ts"
  }
}
```

Then we can run the following command to remove all the environment variables from Vercel.

```bash
bun run remove:all

# should see something like

Skipping NX_DAEMON="false"
Skipping TURBO_DOWNLOAD_LOCAL_ENABLED="true"
Skipping TURBO_REMOTE_ONLY="true"
Skipping TURBO_RUN_SUMMARY="true"
Skipping VERCEL="1"
Skipping VERCEL_ENV="production"
Skipping VERCEL_GIT_COMMIT_AUTHOR_LOGIN=""
Skipping VERCEL_GIT_COMMIT_AUTHOR_NAME=""
Skipping VERCEL_GIT_COMMIT_MESSAGE=""
Skipping VERCEL_GIT_COMMIT_REF=""
Skipping VERCEL_GIT_COMMIT_SHA=""
Skipping VERCEL_GIT_PREVIOUS_SHA=""
Skipping VERCEL_GIT_PROVIDER=""
Skipping VERCEL_GIT_PULL_REQUEST_ID=""
Skipping VERCEL_GIT_REPO_ID=""
Skipping VERCEL_GIT_REPO_OWNER=""
Skipping VERCEL_GIT_REPO_SLUG=""
Skipping VERCEL_URL=""
Vercel CLI 34.2.0
Retrieving project…
Removing
Removed Environment Variable [276ms]
```

### Conclusion

And that's it! We've created a set of scripts that allow us to interact with Vercel's environment variables in a more efficient way. We can now pull, push, update and remove environment variables from Vercel using Bun. This is particularly useful for teams that have a lot of environment variables to manage across multiple environments. We can now share environment variables with team members, back them up, and manage them more effectively.

---

### Summary of basic usage


```bash
# PULL ENVIRONMENT VARIABLES FROM VERCEL

# direct
bun run scripts/pull.vercel.ts --env development
bun run scripts/pull.vercel.ts --env preview
bun run scripts/pull.vercel.ts --env production

# script
bun run pull --env <environment>
# or
bun run pull -e <environment>

# ADD ENVIRONMENT VARIABLES TO VERCEL VIA CLI

# direct
bun run scripts/push.vercel.ts --var TEST_1=hello --var TEST_2=goodbye
bun run scripts/pull.vercel.ts --env <environment>

# script
bun run add:cli --var TEST_1=hello --var TEST_2=goodbye
# or
bun run add:cli -v TEST_1=hello -v TEST_2=goodbye


# ADD ENVIRONMENT VARIABLES TO VERCEL FROM LOCAL ENV FILE

# direct
bun run scripts/push-from-file.vercel.ts --env <environment> --file .env.example

# script
bun run add:file --file .env.example
# or
bun run add:file -f .env.example

# REMOVE ENVIRONMENT VARIABLES FROM VERCEL VIA CLI

# direct
bun run scripts/remove.vercel.ts --var TEST_1 -e development

# script
bun run remove --var TEST_1 --var TEST_2
# or
bun run remove -v TEST_1 -v TEST_2

# REMOVE ALL ENVIRONMENT VARIABLES FROM VERCEL

bun run remove:all
```