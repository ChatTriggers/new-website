import { randomUUID } from "node:crypto";
import { isEmailVerified } from "app/(utils)";
import type { SlugProps } from "app/(utils)/next";
import {
  BadQueryParamError,
  ClientError,
  ConflictError,
  db,
  ForbiddenError,
  getAllowedVersions,
  getFormData,
  getFormEntry,
  getSessionFromRequest,
  NotAuthenticatedError,
  NotFoundError,
  Rank,
  type RelationalModule,
  type Release,
  route,
} from "app/api";
import { storage } from "app/api/(utils)";
import Version from "app/api/(utils)/Version";
import { onReleaseCreated, onReleaseNeedsToBeVerified } from "app/api/(utils)/webhooks";
import * as modules from "app/api/modules";
import JSZip from "jszip";
import type { NextRequest } from "next/server";

export const PUT = route(async (req: NextRequest, { params }: SlugProps<"nameOrId">) => {
  const session = getSessionFromRequest(req);
  if (!session) throw new NotAuthenticatedError();
  if (!isEmailVerified(session)) throw new ForbiddenError("Email not verified");

  const existingModule = await modules.getOne(params.nameOrId);
  if (!existingModule) throw new NotFoundError("Module not found");

  if (session.id !== existingModule.user.id && session.rank === Rank.default)
    throw new ForbiddenError("No permission");

  const form = await getFormData(req);

  const releaseVersion = getFormEntry({
    form,
    name: "releaseVersion",
    type: "string",
  });
  if (!Version.parse(releaseVersion))
    throw new BadQueryParamError("releaseVersion", releaseVersion);

  const modVersion = getFormEntry({
    form,
    name: "modVersion",
    type: "string",
  });
  const allAllowedVersions = (await getAllowedVersions()).modVersions;
  if (!(modVersion in allAllowedVersions)) throw new BadQueryParamError("modVersion", modVersion);
  const allowedGameVersions = (allAllowedVersions as Record<string, string[]>)[modVersion];
  if (!allowedGameVersions) throw new BadQueryParamError("modVersion", modVersion);

  const gameVersions = getFormEntry({
    form,
    name: "gameVersions",
    type: "string",
  }).split(",");
  for (const gameVersion in gameVersions) {
    if (!allowedGameVersions.includes(gameVersion))
      throw new BadQueryParamError("gameVersions", gameVersion);
  }

  const existingRelease = await db.release.findFirst({
    where: {
      module: {
        id: existingModule.id,
      },
      release_version: releaseVersion,
    },
  });
  if (existingRelease)
    throw new ConflictError(`Release with version ${releaseVersion} already exists`);

  const changelog = getFormEntry({
    form,
    name: "changelog",
    type: "string",
    optional: true,
  });

  const release = await db.release.create({
    data: {
      id: randomUUID(),
      module_id: existingModule.id,
      release_version: releaseVersion,
      mod_version: modVersion,
      changelog,
      verified: session.rank !== Rank.default,
    },
  });

  const zipFile = getFormEntry({ form, name: "module", type: "file" });
  await saveZipFile(existingModule, release, zipFile);

  if (!existingModule.hidden && release.verified) onReleaseCreated(existingModule, release);

  if (!release.verified) await onReleaseNeedsToBeVerified(existingModule, release);

  return new Response("Release created", { status: 201 });
});

async function saveZipFile(
  module: RelationalModule<"user">,
  release: Release,
  zipFile: File,
): Promise<void> {
  let zip = await JSZip.loadAsync(await zipFile.arrayBuffer());

  // If the user uploaded a zip file with a single directory, we need to unwrap it
  const singleDir = zip.folder(module.name);
  if (singleDir) zip = singleDir;

  const metadataFile = zip.file("metadata.json");
  if (!metadataFile) throw new ClientError("zip file has no metadata.json file");

  // Normalize the metadata file
  let metadata: modules.Metadata;
  try {
    metadata = JSON.parse(await metadataFile.async("text"));
  } catch {
    throw new ClientError("Invalid metadata.json file");
  }

  metadata.name = module.name;
  metadata.version = release.release_version;
  metadata.tags = module.tags ? module.tags.split(",") : undefined;
  metadata.pictureLink = module.hasImage
    ? await storage.getImageUrl("module", module.name)
    : undefined;
  metadata.creator = module.user.name;
  metadata.author = undefined;
  metadata.description = module.description ?? undefined;
  metadata.changelog;

  const metadataStr = JSON.stringify(metadata, null, 2);

  zip.remove("metadata.json");
  zip.file("metadata.json", metadataStr);

  try {
    // Save to storage folder
    await storage.setReleaseFile(
      "scripts",
      module.name,
      release.id,
      await zip.generateAsync({ type: "uint8array" }),
    );

    // Also save the metadata file separately for quick access
    await storage.setReleaseFile("metadata", module.name, release.id, metadataStr);
  } catch (e) {
    await storage.deleteRelease(module.name, release.id);
    throw e;
  }
}
