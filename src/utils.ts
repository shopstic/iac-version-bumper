import { captureExec, fsExists, inheritExec, Path, Type } from "./deps.ts";

import type { Static } from "./deps.ts";

export const VersionBumpTargetsSchema = Type.Array(Type.Object({
  versionFilePath: Type.String(),
  versionFileTemplate: Type.String(),
  name: Type.String(),
  image: Type.String(),
}));

export type VersionBumpTargets = Static<typeof VersionBumpTargetsSchema>;

export async function autoBumpVersions(
  { repoPath, targets }: {
    repoPath: string;
    targets: VersionBumpTargets;
  },
) {
  const gitPullCmd = ["git", "pull", "--rebase", "origin", "master"];

  await inheritExec({ run: { cmd: gitPullCmd, cwd: repoPath } });

  const promises = targets
    .map(async ({ name, versionFilePath, image }) => {
      const fullVersionFilePath = Path.join(repoPath, versionFilePath);

      const currentDigest = await (async () => {
        if (await fsExists(fullVersionFilePath)) {
          const currentDigestSource = await Deno.readTextFile(
            Path.join(repoPath, versionFilePath),
          );

          return JSON.parse(
            currentDigestSource.match(/^export default ([^;]+)/)![1],
          );
        } else {
          return "";
        }
      })();

      console.log(`Fetching digest for ${image}`);

      const digest = (await captureExec({
        run: {
          cmd: ["reg", "digest", image],
        },
      })).trim();

      console.log(
        `Got digest for ${image}: ${digest} vs. ${currentDigest || "unknown"}`,
      );

      if (digest !== currentDigest) {
        return {
          versionFilePath,
          name,
          image,
          digest,
        };
      } else {
        return null;
      }
    });

  const changes = (await Promise.all(promises)).filter((c) => c !== null);

  await Promise.all(
    changes
      .map(async (change) => {
        const { versionFilePath, digest } = change!;
        await Deno.writeTextFile(
          Path.join(repoPath, versionFilePath),
          `export default ${JSON.stringify(digest)};\n`,
        );
      }),
  );

  const gitStatus = await captureExec(
    { run: { cmd: ["git", "status"], cwd: repoPath } },
  );

  if (!gitStatus.includes("nothing to commit, working tree clean")) {
    console.log("Needs to commit, git status:", gitStatus);

    await inheritExec({ run: { cmd: ["git", "add", "*"], cwd: repoPath } });

    const changedNames = changes.map((c) => c!.name);

    await inheritExec(
      {
        run: {
          cmd: [
            "git",
            "commit",
            "-m",
            `Bump version${changedNames.length > 1 ? "s" : ""} for ${
              changedNames.join(", ")
            }`,
          ],
          cwd: repoPath,
        },
      },
    );
    await inheritExec(
      {
        run: {
          cmd: ["git", "push", "origin", "master"],
          cwd: repoPath,
        },
      },
    );
  } else {
    console.log("Nothing to commit");
  }
}
