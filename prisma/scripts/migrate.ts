import colors from "ansi-colors";
import { MultiBar } from "cli-progress";
import { PrismaClient, Rank } from "../generated/client";
import { PrismaClient as PrismaLegacyClient } from "../generated/legacy-client";
import { storage, createStorageFromEnv } from "../../app/api/(utils)/storage";
import sharp from "sharp";

const legacyClient = new PrismaLegacyClient();
const client = new PrismaClient();

const legacyStorage = createStorageFromEnv(undefined, 'OLD_STORAGE_LOCAL_DIR');

// Remove all existing data
await client.email.deleteMany({});
await client.notification.deleteMany({});
await client.release.deleteMany({});
await client.module.deleteMany({});
await client.user.deleteMany({});

let bar = new MultiBar({
  format: `Migrating Users | ${colors.cyan("{bar}")} | {percentage}% | {value}/{total}`,
});

const legacyUsers = await legacyClient.users.findMany({});
const legacyUserIdMap = new Map<bigint, string>();
let progress = bar.create(legacyUsers.length, 0);

for (const legacyUser of await legacyClient.users.findMany({})) {
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
    },
  });

  legacyUserIdMap.set(legacyUser.id, user.id);

  // Migrate image
  const image = await legacyStorage.getImage("user", legacyUser.name);
  if (image) {
    storage.setImage("user", legacyUser.name, sharp(image));
  }
}

bar.stop();

bar = new MultiBar({
  format: `Migrating Modules | ${colors.cyan("{bar}")} | {percentage}% | {value}/{total}`,
});

const legacyModules = await legacyClient.modules.findMany({});
const legacyModuleIdMap = new Map<bigint, string>();
progress = bar.create(legacyModules.length, 0);

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
    storage.setImage("module", legacyModule.name, sharp(image));
  }

  const module = await client.module.create({
    data: {
      user_id: userId,
      name: legacyModule.name,
      description: legacyModule.description,
      downloads: Number(legacyModule.downloads),
      hidden: legacyModule.hidden,
      tags: legacyModule.tags ?? "",
    },
  });

  // Migrate all of the module's releases
  const legacyReleases = await legacyClient.releases.findMany({
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
      },
    });

    let uuid = legacyRelease.id;
    uuid = `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}-${uuid.substring(16, 20)}-${uuid.substring(20)}`;

    const scripts = await legacyStorage.getReleaseFile("scripts", legacyModule.name, uuid);
    const metadata = await legacyStorage.getReleaseFile("metadata", legacyModule.name, uuid);

    await storage.setReleaseFile("scripts", module.name, release.id, scripts);
    await storage.setReleaseFile("metadata", module.name, release.id, metadata);

    if (legacyRelease.verification_token !== null)
      bar.log(
        `Warning: Release ${uuid} of module ${legacyModule.id} has a pending verification token\n`,
      );
  }

  legacyModuleIdMap.set(legacyModule.id, module.id);
  progress.increment();
}

bar.stop();
