import {
  CliProgram,
  createCliAction,
  inheritExec,
  Type,
  validate,
} from "./deps.ts";

import type { Static } from "./deps.ts";

import { autoBumpVersions, VersionBumpTargetsSchema } from "./utils.ts";

export const ParamsSchema = Type.Object({
  iacRepoUri: Type.String({ minLength: 1 }),
  checkIntervalSeconds: Type.Number({ minimum: 0 }),
  targetsConfigFile: Type.String({ minLength: 1 }),
});

export type Params = Static<typeof ParamsSchema>;

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

await new CliProgram()
  .addAction(
    "auto-bump-versions",
    createCliAction(
      ParamsSchema,
      async ({ targetsConfigFile, iacRepoUri, checkIntervalSeconds }) => {
        const repoPath = await Deno.makeTempDir();
        const gitCloneCmd = ["git", "clone", iacRepoUri, repoPath];

        await inheritExec({ run: { cmd: gitCloneCmd } });

        while (true) {
          console.error(
            `Reading targets config from: ${
              targetsConfigFile === "-" ? "stdin" : targetsConfigFile
            }`,
          );

          const targetsConfigHandle = targetsConfigFile === "-"
            ? Deno.stdin
            : await Deno.open(
              targetsConfigFile,
              { read: true, write: false },
            );

          const targetsConfigRaw = JSON.parse(new TextDecoder().decode(
            await Deno.readAll(targetsConfigHandle),
          ));

          const targetsConfigResult = validate(
            VersionBumpTargetsSchema,
            targetsConfigRaw,
          );

          if (!targetsConfigResult.isSuccess) {
            throw new Error(
              `Failed validating targets config. Payload:\n${
                JSON.stringify(targetsConfigRaw, null, 2)
              }\nErrors:\n${JSON.stringify(targetsConfigResult, null, 2)}`,
            );
          }

          const targets = targetsConfigResult.value;

          await autoBumpVersions({ repoPath, targets });
          await delay(checkIntervalSeconds * 1000);
        }
      },
    ),
  )
  .run(Deno.args);
