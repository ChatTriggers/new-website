import colors from "ansi-colors";
import { MultiBar } from "cli-progress";
import sharp from "sharp";
import { FileStorage, storage } from "../../app/api/(utils)/storage";
import { PrismaClient, Rank } from "../generated/client";
import { PrismaClient as PrismaLegacyClient } from "../generated/legacy-client";

const legacyClient = new PrismaLegacyClient();
const client = new PrismaClient();

const legacyStorage = FileStorage.fromEnv("OLD_STORAGE_LOCAL_DIR");

// Remove all existing data
Promise.allSettled([
  client.email.deleteMany({}),
  client.notification.deleteMany({}),
  client.release.deleteMany({}),
  client.module.deleteMany({}),
  client.user.deleteMany({}),
  client.trackedTimestamp.deleteMany({}),
  client.trackedUser.deleteMany({}),
]);

let bar = new MultiBar({
  format: `Migrating Users | ${colors.cyan("{bar}")} | {percentage}% | {value}/{total}`,
});

const legacyUsers = await legacyClient.user.findMany({});
const legacyUserIdMap = new Map<bigint, string>();
let progress = bar.create(legacyUsers.length, 0);

for (const legacyUser of await legacyClient.user.findMany({})) {
  progress.increment();

  if (legacyUser.name.length > 32) {
    bar.log(`Warning: Skipping user "${legacyUser.name}" due to name length\n`);
    continue;
  }

  const rank = Rank[legacyUser.rank];
  const user = await client.user.create({
    data: {
      name: legacyUser.name,
      email: legacyUser.email,
      email_verified: false,
      password: legacyUser.password,
      rank,
      created_at: legacyUser.created_at ?? undefined,
      updated_at: legacyUser.updated_at ?? undefined,
    },
  });

  legacyUserIdMap.set(legacyUser.id, user.id);
}

bar.stop();

bar = new MultiBar({
  format: `Migrating Modules | ${colors.cyan("{bar}")} | {percentage}% | {value}/{total}`,
});

const legacyModules = await legacyClient.module.findMany({});
const legacyModuleIdMap = new Map<bigint, string>();
progress = bar.create(legacyModules.length, 0);

interface StorageToWrite {
  type: "scripts" | "metadata";
  moduleName: string;
  releaseId: string;
  file: Buffer;
}
const storageToWrite: StorageToWrite[] = [];

for (const legacyModule of legacyModules) {
  // Skip a module with an invalid name
  if (legacyModule.name.startsWith("&9")) continue;

  const userId = legacyUserIdMap.get(legacyModule.user_id);
  if (!userId) {
    throw new Error(
      `Unknown legacy user ID ${legacyModule.user_id} for module ${legacyModule.name}`,
    );
  }

  const image = await legacyStorage.getImage("module", legacyModule.name);
  if (image) {
    storage().setImage("module", legacyModule.name, sharp(image));
  }

  const module = await client.module.create({
    data: {
      user_id: userId,
      name: legacyModule.name,
      description: legacyModule.description,
      downloads: Number(legacyModule.downloads),
      hidden: legacyModule.hidden,
      tags: legacyModule.tags ?? "",
      created_at: legacyModule.created_at ?? undefined,
      updated_at: legacyModule.updated_at ?? undefined,
    },
  });

  // Migrate all of the module's releases
  const legacyReleases = await legacyClient.release.findMany({
    where: {
      module_id: legacyModule.id,
    },
  });

  for (const legacyRelease of legacyReleases) {
    const release = await client.release.create({
      data: {
        module_id: module.id,
        release_version: legacyRelease.release_version,
        mod_version: legacyRelease.mod_version,
        changelog: legacyRelease.changelog,
        downloads: legacyRelease.downloads,
        verified: legacyRelease.verified,
        created_at: legacyRelease.created_at,
        updated_at: legacyRelease.updated_at,
      },
    });

    const uuid = legacyRelease.id;
    try {
      const scripts = await legacyStorage.getReleaseFile("scripts", legacyModule.name, uuid);
      const metadata = await legacyStorage.getReleaseFile("metadata", legacyModule.name, uuid);

      storageToWrite.push({
        type: "scripts",
        moduleName: module.name,
        releaseId: release.id,
        file: scripts,
      });
      storageToWrite.push({
        type: "metadata",
        moduleName: module.name,
        releaseId: release.id,
        file: metadata,
      });

      if (legacyRelease.verification_token !== null)
        bar.log(
          `Warning: Release ${uuid} of module ${legacyModule.id} has a pending verification token\n`,
        );
    } catch {
      bar.log(`Warning: Skipping release ${uuid} of module ${legacyModule.id}`);
      await client.release.delete({
        where: { id: release.id },
      });
    }
  }

  legacyModuleIdMap.set(legacyModule.id, module.id);
  progress.increment();
}

bar.stop();

{
  const bar = new MultiBar({
    format: `Migrating TrackedUsers | ${colors.cyan("{bar}")} | {percentage}% | {value}/{total}`,
  });

  const totalCount = await legacyClient.trackedUser.count();
  const progress = bar.create(totalCount, 0);

  for (let i = 0; i < totalCount; i += 100000) {
    const users = await legacyClient.trackedUser.findMany({
      skip: i,
      take: 100000,
    });
    await client.trackedUser.createMany({ data: users });
    progress.increment(users.length);
  }

  bar.stop();
}

{
  const bar = new MultiBar({
    format: `Migrating TrackedTimestamps | ${colors.cyan("{bar}")} | {percentage}% | {value}/{total}`,
  });

  const totalCount = await legacyClient.trackedTimestamp.count();
  const progress = bar.create(totalCount, 0);

  for (let i = 0; i < totalCount; i += 100000) {
    const timestamps = await legacyClient.trackedTimestamp.findMany({
      skip: i,
      take: 100000,
    });
    await client.trackedTimestamp.createMany({ data: timestamps });
    progress.increment(timestamps.length);
  }

  bar.stop();
}

{
  const bar = new MultiBar({
    format: `Migrating Module Storage | ${colors.cyan("{bar}")} | {percentage}% | {value}/{total}`,
  });

  const progress = bar.create(storageToWrite.length, 0);

  for (const s of storageToWrite) {
    await storage().setReleaseFile(s.type, s.moduleName, s.releaseId, s.file);
    progress.increment();
  }

  bar.stop();
}
